# Runbook: Secret Rotation Failure

## Symptom

`ExternalSecret` is not updating `app-db-secret`, or the pod still sees the old password after 60 seconds.

## Checks

```bash
kubectl get externalsecret app-db-secret -n demo
kubectl describe externalsecret app-db-secret -n demo
kubectl get secret app-db-secret -n demo
kubectl logs -n demo deploy/secret-reader -f
```

## Likely Causes

- `awssm-secret` is missing or has invalid AWS credentials.
- AWS secret `w10/lab/demo/app` does not exist in `ap-southeast-1`.
- `refreshInterval` has not elapsed yet.
- The application reads env vars instead of rereading mounted secret files.

## Recovery

1. Fix AWS credentials or secret name.
2. Wait for ESO refresh, or re-apply `ExternalSecret`.
3. Verify the mounted files changed without restarting the pod.
