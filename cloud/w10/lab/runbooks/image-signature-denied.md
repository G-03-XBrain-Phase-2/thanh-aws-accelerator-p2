# Runbook: Image Signature Denied

## Symptom

Pod creation is rejected by Sigstore Policy Controller because the image is unsigned or signed by the wrong key.

## Checks

```bash
kubectl get clusterimagepolicy
kubectl describe clusterimagepolicy w10-api-must-be-signed
cosign verify --key cloud/w10/lab/signing/cosign.pub <IMAGE>
kubectl get events -n demo --sort-by=.lastTimestamp
```

## Likely Causes

- The image tag in `rollout.yaml` was not signed.
- The workflow signed a different tag or digest.
- `COSIGN_PRIVATE_KEY` / `COSIGN_PASSWORD` GitHub secrets are missing.
- `cluster-image-policy.yaml` still contains the placeholder public key.

## Recovery

1. Generate or restore the Cosign key pair.
2. Store private key and password in GitHub Secrets.
3. Commit the real public key into `signing/cosign.pub` and `policies/cluster-image-policy.yaml`.
4. Re-run the image workflow and deploy the signed tag.
