import uuid
from django.db import models, transaction
from django.core.exceptions import ValidationError

class Merchant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)

class LedgerEntry(models.Model):
    TYPE_CHOICES = [('CREDIT', 'Credit'), ('DEBIT', 'Debit')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name='ledger_entries')
    amount_paise = models.BigIntegerField()
    type = models.CharField(max_length=6, choices=TYPE_CHOICES)
    reference_id = models.CharField(max_length=255, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

class IdempotencyKey(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.CASCADE, related_name='idem_keys')
    key = models.CharField(max_length=255, db_index=True)
    response_data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['merchant', 'key'], name='unique_merchant_key')]

class Payout(models.Model):
    STATUS_CHOICES = [('pending','Pending'), ('processing','Processing'), ('completed','Completed'), ('failed','Failed')]
    VALID_TRANSITIONS = {
        'pending': ['processing'],
        'processing': ['completed', 'failed'],
        'completed': [],
        'failed': []
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    merchant = models.ForeignKey(Merchant, on_delete=models.PROTECT, related_name='payouts')
    amount_paise = models.BigIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending', db_index=True)
    bank_account_id = models.CharField(max_length=255)
    idempotency_key = models.CharField(max_length=255, db_index=True)
    attempts = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def transition_to(self, new_status):
        if new_status not in self.VALID_TRANSITIONS.get(self.status, []):
            raise ValidationError(f"Invalid state transition: {self.status} -> {new_status}")
        self.status = new_status
        self.attempts += 1
        self.save(update_fields=['status', 'attempts', 'updated_at'])
