from django.db import transaction, IntegrityError
from django.db.models import Sum
from django.db.models.functions import Coalesce
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import JSONParser
from rest_framework.response import Response
from rest_framework import status
from .models import Merchant, LedgerEntry, Payout, IdempotencyKey
from .tasks import process_payout

@api_view(['GET'])
def get_balance(request):
    merchant_id = request.headers.get('Merchant-Id')
    if not merchant_id:
        return Response({'error': 'Missing Merchant-Id header'}, status=400)
    balance = LedgerEntry.objects.filter(merchant_id=merchant_id).aggregate(
        total=Coalesce(Sum('amount_paise'), 0)
    )['total']
    return Response({'available_balance': balance})

@api_view(['POST'])
@parser_classes([JSONParser])
def create_payout(request):
    merchant_id = request.headers.get('Merchant-Id')
    idem_key = request.headers.get('Idempotency-Key')
    if not (merchant_id and idem_key):
        return Response({'error': 'Headers Merchant-Id and Idempotency-Key required'}, status=400)
    try:
        amount = int(request.data['amount_paise'])
        bank_account = str(request.data['bank_account_id'])
        if amount <= 0: raise ValueError
    except (ValueError, KeyError):
        return Response({'error': 'Invalid payload'}, status=400)

    with transaction.atomic():
        ik, created = IdempotencyKey.objects.select_for_update().get_or_create(
            merchant_id=merchant_id, key=idem_key,
            defaults={'response_data': {'status': 'IN_FLIGHT'}}
        )
        if not created:
            if 'id' in ik.response_data:
                
                from .models import Payout
                live_payout = Payout.objects.get(id=ik.response_data['id'])
                # Return cached response but with updated status
                updated = {**ik.response_data, 'status': live_payout.status}
                return Response(updated, status=200)
            
            return Response(ik.response_data, status=200 if ik.response_data.get('status') != 'IN_FLIGHT' else 202)

        merchant = Merchant.objects.select_for_update().get(id=merchant_id)
        balance = LedgerEntry.objects.filter(merchant=merchant).aggregate(
            total=Coalesce(Sum('amount_paise'), 0)
        )['total']

        if balance < amount:
            ik.response_data = {'status': 'FAILED', 'error': 'Insufficient balance'}
            ik.save(update_fields=['response_data'])
            return Response(ik.response_data, status=400)

        payout = Payout.objects.create(
            merchant=merchant, amount_paise=amount,
            status='pending', bank_account_id=bank_account,
            idempotency_key=idem_key
        )
        LedgerEntry.objects.create(
            merchant=merchant, amount_paise=-amount,
            type='DEBIT', reference_id=str(payout.id)
        )

        response_data = {'id': str(payout.id), 'status': payout.status, 'amount_paise': payout.amount_paise}
        ik.response_data = response_data
        ik.save(update_fields=['response_data'])
        transaction.on_commit(lambda: process_payout.delay(str(payout.id)))

    return Response(response_data, status=201)

@api_view(['GET'])
def get_payout_history(request):
    merchant_id = request.headers.get('Merchant-Id')
    if not merchant_id:
        return Response({'error': 'Missing Merchant-Id header'}, status=400)
    payouts = Payout.objects.filter(merchant_id=merchant_id).values(
        'id', 'amount_paise', 'status', 'bank_account_id', 'attempts', 'created_at'
    )
    return Response(list(payouts))
