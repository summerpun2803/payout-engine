import random
from celery import shared_task
from django.db import transaction
from django.utils import timezone
from .models import Payout, LedgerEntry

@shared_task(bind=True, max_retries=3)
def process_payout(self, payout_id):
    # Tx1: Claim payout
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status in ('completed', 'failed'):
            return 'ALREADY_FINALIZED'
        if payout.status == 'processing':
            return 'ALREADY_PROCESSING'
        payout.transition_to('processing')
    # Commit releases lock

    # Simulate bank processing (outside transaction)
    outcome = random.random()

    # Tx2: Finalize
    with transaction.atomic():
        payout = Payout.objects.select_for_update().get(id=payout_id)
        if payout.status != 'processing':
            return f'STATE_CHANGED_TO_{payout.status}'

        if outcome < 0.7:
            payout.transition_to('completed')
            return 'COMPLETED'
        elif outcome < 0.9:
            payout.transition_to('failed')
            LedgerEntry.objects.create(
                merchant=payout.merchant, amount_paise=payout.amount_paise,
                type='CREDIT', reference_id=f'refund_{payout.id}'
            )
            return 'FAILED'
        else:
            if self.request.retries < self.max_retries:
                raise self.retry(countdown=2 ** self.request.retries, exc=Exception("Bank timeout"))
            payout.transition_to('failed')
            LedgerEntry.objects.create(
                merchant=payout.merchant, amount_paise=payout.amount_paise,
                type='CREDIT', reference_id=f'refund_timeout_{payout.id}'
            )
            return 'FAILED_TIMEOUT'

@shared_task
def scan_stuck_payouts():
    threshold = timezone.now() - timezone.timedelta(seconds=30)
    stuck = Payout.objects.filter(status='processing', updated_at__lt=threshold, attempts__lte=3)
    for p in stuck:
        process_payout.delay(str(p.id))
