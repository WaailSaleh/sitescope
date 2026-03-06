#!/bin/bash
# =============================================================================
# SiteScope Cluster Bootstrap — run on nuc-hypervisor (10.0.0.143) as admin
# Run each block separately and verify before proceeding to the next.
# =============================================================================

# ===========================================================================
# BLOCK 1 — Install Helm
# ===========================================================================
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version

# ===========================================================================
# BLOCK 2 — Install cert-manager
# ===========================================================================
helm repo add jetstack https://charts.jetstack.io
helm repo update

sudo helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.15.1 \
  --set crds.enabled=true \
  --kubeconfig /etc/rancher/k3s/k3s.yaml \
  --wait

# Verify — all 3 pods should be Running
sudo kubectl get pods -n cert-manager

# ===========================================================================
# BLOCK 3 — Create Cloudflare secret for cert-manager
# ===========================================================================
sudo kubectl create secret generic cloudflare-api-token \
  --from-literal=api-token=5ObjUTlD5_JzUmzBgCDJoRDxMmEM75acb6ydr-M0 \
  --namespace cert-manager

sudo kubectl get secret cloudflare-api-token -n cert-manager

# ===========================================================================
# BLOCK 4 — Apply ClusterIssuer (Let's Encrypt DNS-01 via Cloudflare)
# ===========================================================================
sudo kubectl apply -f - <<'EOF'
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    email: waailsaleh@hotmail.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-staging
spec:
  acme:
    email: waailsaleh@hotmail.com
    server: https://acme-staging-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-staging-account-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
EOF

# Verify — READY should be True (takes ~30s)
sudo kubectl get clusterissuer

# ===========================================================================
# BLOCK 5 — Request wildcard TLS certificate
# ===========================================================================
sudo kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-tls
  namespace: cert-manager
spec:
  secretName: wildcard-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - "jidka.org"
    - "*.jidka.org"
  renewBefore: 360h
EOF

# Watch it issue (takes 1-3 minutes):
sudo kubectl get certificate -n cert-manager -w
# Wait for Ready = True, then Ctrl+C

# Debug if stuck:
# sudo kubectl describe certificate wildcard-tls -n cert-manager
# sudo kubectl get challenges -A

# ===========================================================================
# BLOCK 6 — Apply DDNS updater (keeps jidka.org A record current)
# ===========================================================================
sudo kubectl apply -f - <<'EOF'
---
apiVersion: v1
kind: Namespace
metadata:
  name: ddns

---
apiVersion: v1
kind: Secret
metadata:
  name: ddns-cloudflare-token
  namespace: ddns
type: Opaque
stringData:
  api-token: "5ObjUTlD5_JzUmzBgCDJoRDxMmEM75acb6ydr-M0"

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: ddns-config
  namespace: ddns
data:
  CLOUDFLARE_ZONE_ID: "b862185c06e9be75d043f6bb424a22cf"
  CLOUDFLARE_RECORD_ID: "efc5d696f830b09875dac546d79ef77c"
  CLOUDFLARE_RECORD_NAME: "jidka.org"

---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ddns-updater
  namespace: ddns
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: ddns
              image: alpine:3.19
              command:
                - /bin/sh
                - -c
                - |
                  set -e
                  apk add --no-cache curl jq -q
                  CURRENT_IP=$(curl -sf https://api.ipify.org)
                  echo "Current IP: $CURRENT_IP"
                  CF_IP=$(curl -sf \
                    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${CLOUDFLARE_RECORD_ID}" \
                    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" | jq -r '.result.content')
                  echo "Cloudflare IP: $CF_IP"
                  if [ "$CURRENT_IP" = "$CF_IP" ]; then
                    echo "IP unchanged."; exit 0
                  fi
                  echo "Updating Cloudflare: $CF_IP -> $CURRENT_IP"
                  curl -sf -X PUT \
                    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${CLOUDFLARE_RECORD_ID}" \
                    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
                    -H "Content-Type: application/json" \
                    --data "{\"type\":\"A\",\"name\":\"${CLOUDFLARE_RECORD_NAME}\",\"content\":\"${CURRENT_IP}\",\"ttl\":60,\"proxied\":false}" \
                    | jq -r 'if .success then "Updated OK" else "FAILED: \(.errors)" end'
              envFrom:
                - configMapRef:
                    name: ddns-config
              env:
                - name: CLOUDFLARE_API_TOKEN
                  valueFrom:
                    secretKeyRef:
                      name: ddns-cloudflare-token
                      key: api-token
              resources:
                requests: { cpu: 10m, memory: 16Mi }
                limits:   { cpu: 100m, memory: 32Mi }
EOF

sudo kubectl get cronjob -n ddns

# ===========================================================================
# BLOCK 7 — Copy wildcard TLS secret to sitescope namespace
# (cert-manager issues the cert in cert-manager ns; ingress needs it in sitescope ns)
# ===========================================================================

# First create the sitescope namespace
sudo kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: sitescope
  labels:
    app.kubernetes.io/managed-by: github-actions
EOF

# Install kubectl-cert-manager plugin OR just copy the secret manually once cert is Ready:
# Wait for: sudo kubectl get secret wildcard-tls -n cert-manager
# Then copy it:
sudo kubectl get secret wildcard-tls -n cert-manager -o yaml \
  | sed 's/namespace: cert-manager/namespace: sitescope/' \
  | sudo kubectl apply -f -

sudo kubectl get secret wildcard-tls -n sitescope

# ===========================================================================
# BLOCK 8 — Create GHCR image pull secret
# Replace YOUR_GITHUB_USERNAME and YOUR_GITHUB_PAT below
# PAT needs: read:packages scope minimum
# Create at: github.com/settings/tokens → Generate new token (classic)
# ===========================================================================
sudo kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace sitescope

sudo kubectl get secret ghcr-pull-secret -n sitescope

# ===========================================================================
# BLOCK 9 — Set up GitHub Actions self-hosted runner
# This lets GitHub Actions deploy directly to your cluster over LAN.
#
# 1. Go to: https://github.com/YOUR_REPO/settings/actions/runners/new
# 2. Select: Linux x64
# 3. Copy and run the download + configure commands shown on that page
#    When asked for runner name: nuc-hypervisor
#    When asked for labels: self-hosted (default is fine)
#    When asked for work folder: press Enter (default)
# 4. Then install as a service:
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
# ===========================================================================

# ===========================================================================
# BLOCK 10 — Verify everything before first deploy
# ===========================================================================
sudo kubectl get nodes
sudo kubectl get pods -n cert-manager
sudo kubectl get clusterissuer
sudo kubectl get certificate -n cert-manager
sudo kubectl get secret wildcard-tls -n cert-manager
sudo kubectl get secret wildcard-tls -n sitescope
sudo kubectl get secret ghcr-pull-secret -n sitescope
sudo kubectl get cronjob -n ddns
