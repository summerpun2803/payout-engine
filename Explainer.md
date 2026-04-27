
## 1. Ledger Query for Balance
Balance is **never stored** as a column. It is computed on-demand via PostgreSQL aggregation to guarantee mathematical consistency and prevent reconciliation drift.

```sql
SELECT COALESCE(SUM(amount_paise), 0) AS available_balance
FROM merchants_ledgerentry
WHERE merchant_id = '<UUID>';
```

**Implementation Details:**
- `amount_paise` is a `BigIntegerField` (integers only, zero floats)
- Credits are stored as **positive** values (`+50000`)
- Debits are stored as **negative** values (`-6000`)
- A simple `SUM()` computes the exact net balance
- Django ORM equivalent:
  ```python
  from django.db.models import Sum, Coalesce
  balance = LedgerEntry.objects.filter(merchant=merchant).aggregate(
      total=Coalesce(Sum('amount_paise'), 0)
  )['total']
  ```

---

## 2. Locking Strategy (`SELECT FOR UPDATE`)
Race conditions are prevented using **PostgreSQL row-level locking** inside a Django atomic transaction. This acts as a strict per-merchant mutex.

```python
with transaction.atomic():
    # Acquire exclusive row lock on Merchant
    merchant = Merchant.objects.select_for_update().get(id=merchant_id)
    
    # Calculate balance under lock
    balance = LedgerEntry.objects.filter(merchant=merchant).aggregate(
        total=Coalesce(Sum('amount_paise'), 0)
    )['total']
    
    if balance < requested_amount:
        raise ValidationError("Insufficient balance")
        
    # Create payout & debit ledger entry
    Payout.objects.create(...)
    LedgerEntry.objects.create(merchant=merchant, amount_paise=-requested_amount, ...)
```

**How it handles concurrent requests (Balance=100, two requests for 60):**
1. Request A acquires `FOR UPDATE` lock → reads balance=100 → creates payout/debit → commits → releases lock
2. Request B waits for lock → acquires lock → re-reads balance=40 → fails validation → rolls back
3. **Result:** Exactly one succeeds. Zero overdraft. Python-level locks or table locks are avoided entirely.

---

## 3. Idempotency Handling
Every client request must include an `Idempotency-Key` header (UUID), scoped per merchant. The system guarantees exactly-once processing.

**Flow (inside `transaction.atomic()`):**
```python
ik, created = IdempotencyKey.objects.select_for_update().get_or_create(
    merchant_id=merchant_id, 
    key=idem_key,
    defaults={'response_data': {'status': 'IN_FLIGHT'}}
)
if not created:
    return Response(ik.response_data, status=200)  # Cache hit
```

**Key Guarantees:**
- **Unique Constraint:** `UNIQUE(merchant_id, key)` prevents duplicate key insertion at the DB level
- **IN_FLIGHT Placeholder:** First request locks the key and writes `IN_FLIGHT`. Retries or parallel requests with the same key see this row, wait for the lock, and return the cached response
- **Deterministic Response:** Subsequent calls with the same key return the exact same JSON payload, regardless of payload changes or timing
- **Zero Side Effects on Retry:** Ledger entries and payouts are only created on the first successful commit

---

## 4. State Machine Enforcement
Payout lifecycle transitions are strictly enforced at the model layer. Backward or invalid transitions are impossible.

```python
VALID_TRANSITIONS = {
    'pending': ['processing'],
    'processing': ['completed', 'failed'],
    'completed': [],
    'failed': []
}

def transition_to(self, new_status):
    if new_status not in self.VALID_TRANSITIONS.get(self.status, []):
        raise ValidationError(f"Invalid transition: {self.status} -> {new_status}")
    self.status = new_status
    self.attempts += 1
    self.save(update_fields=['status', 'attempts', 'updated_at'])
```

**Rules Enforced:**
- `completed` → `anything` = **BLOCKED**
- `failed` → `completed` = **BLOCKED**
- `processing` → `pending` = **BLOCKED**
- Any violation raises `ValidationError`, which automatically rolls back the enclosing `transaction.atomic()` block
- State changes and ledger refunds are committed together, guaranteeing atomicity

---

## 5. One AI Mistake & Fix
**Mistake:** Initially, the Celery worker held a `SELECT FOR UPDATE` lock on the `Payout` row for the **entire duration** of the simulated bank processing (including network timeouts and retry backoffs). This exhausted the PostgreSQL connection pool under load and deadlocked concurrent payouts.

**Fix:** Split the worker into **two short, atomic transactions** and decoupled I/O from DB locks:
1. **Tx1:** Acquire lock → validate state → transition `pending → processing` → **COMMIT** (releases lock immediately)
2. **Simulate Bank I/O:** Runs outside any transaction (includes retry backoff if stuck)
3. **Tx2:** Re-acquire lock → transition to `completed` or `failed` → insert refund ledger if failed → **COMMIT**
4. **API Layer Fix:** Used `transaction.on_commit(lambda: process_payout.delay(...))` to ensure Celery tasks are only queued **after** the payout and initial debit are safely committed to PostgreSQL.

This pattern guarantees zero lock contention during external latency, prevents connection starvation, and maintains strict ACID compliance for financial operations.
