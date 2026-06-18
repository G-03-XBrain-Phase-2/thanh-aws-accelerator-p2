# Tenant: payments

This folder creates the isolated `payments` namespace.

## Why Existing Guardrails Apply

Gatekeeper constraints are cluster-level policies. Once their `match.namespaces` includes `payments`, every Pod admitted into `payments` is checked by the same existing rules:

- no `:latest` image tag
- must run as non-root
- no hostNetwork
- must define CPU/memory limits

No new policy is needed for the new team; only the tenant namespace is added to the match scope.

## Why RoleBinding, Not ClusterRoleBinding

`RoleBinding` grants permissions only inside the `payments` namespace. `ClusterRoleBinding` would grant permissions cluster-wide and could accidentally let `payments-dev` operate in `demo` or other namespaces.
