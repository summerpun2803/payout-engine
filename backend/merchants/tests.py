import uuid
import threading
import requests
from django.test import LiveServerTestCase, TransactionTestCase
from rest_framework.test import APIClient
from .models import Merchant, LedgerEntry

class ConcurrencyTest(LiveServerTestCase):
    def test_no_overdraft_under_race(self):
        merchant = Merchant.objects.create(name='RaceMerchant')
        LedgerEntry.objects.create(merchant=merchant, amount_paise=100, type='CREDIT', reference_id='seed')
        
        results = []
        def hit_api():
            resp = requests.post(
                f'{self.live_server_url}/api/v1/payouts',
                json={'amount_paise': 60, 'bank_account_id': 'ACC_X'},
                headers={
                    'Merchant-Id': str(merchant.id),
                    'Idempotency-Key': str(uuid.uuid4()),
                    'Content-Type': 'application/json'
                },
                timeout=10
            )
            results.append(resp.status_code)

        threads = [threading.Thread(target=hit_api) for _ in range(5)]
        for t in threads: t.start()
        for t in threads: t.join()

        self.assertEqual(results.count(201), 1)
        self.assertEqual(results.count(400), 4)

class IdempotencyTest(TransactionTestCase):
    def test_same_key_returns_cached_response(self):
        merchant = Merchant.objects.create(name='IdemMerchant')
        LedgerEntry.objects.create(merchant=merchant, amount_paise=500, type='CREDIT', reference_id='seed')
        key = str(uuid.uuid4())
        payload = {'amount_paise': 50, 'bank_account_id': 'B1'}
        headers = {'Merchant-Id': str(merchant.id), 'Idempotency-Key': key}
        client = APIClient()
        
        r1 = client.post('/api/v1/payouts', payload, format='json', headers=headers)
        r2 = client.post('/api/v1/payouts', payload, format='json', headers=headers)
        # ✅ FIXED: Added format='json'
        r3 = client.post('/api/v1/payouts', {'amount_paise': 9999, 'bank_account_id': 'B2'}, format='json', headers=headers)
        
        self.assertEqual(r1.status_code, 201)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r1.json(), r2.json())
        self.assertEqual(r3.json(), r2.json())  