# Evidence Checklist

Paste command output or screenshots here before submission.

## ESO Rotation

```bash
kubectl logs -n demo deploy/secret-reader -f
```

Expected: `DB_PASSWORD` changes within 60 seconds after AWS Secrets Manager rotation, with pod restart count unchanged.

## Trivy

Expected: image workflow fails on HIGH/CRITICAL CVE.

## Signature Admission

Expected:

- Unsigned image: rejected.
- Signed image: admitted.
