from django.core.management.base import BaseCommand
from merchants.models import Merchant, LedgerEntry

class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        ids = ['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002']
        for i, uid in enumerate(ids, 1):
            m, _ = Merchant.objects.get_or_create(id=uid, defaults={'name': f'Merchant_{i}'})
            LedgerEntry.objects.create(merchant=m, amount_paise=50000, type='CREDIT', reference_id=f'SEED_{i}')
        self.stdout.write(self.style.SUCCESS('✅ Seeded 2 merchants with ₹500 each.'))
