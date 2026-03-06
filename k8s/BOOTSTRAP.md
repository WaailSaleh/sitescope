# Cluster Bootstrap — One-Time Setup

Run these steps **once** on a machine with `kubectl` pointing at your k3s cluster.
After this, everything else is managed by GitHub Actions and manifests.

## Prerequisites
- k3s cluster running, `kubectl` configured
- Helm 3 installed: `curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash`
- Your domain on Cloudflare
- Cloudflare API token (see step 2)

---

## Step 1 — Disable k3s built-in Traefik

k3s ships Traefik by default. We're replacing it with nginx-ingress.

```bash
# On each k3s server node, add this flag to disable Traefik:
sudo nano /etc/systemd/system/k3s.service

# Find the ExecStart line and add: --disable=traefik
# ExecStart=/usr/local/bin/k3s server --disable=traefik

sudo systemctl daemon-reload && sudo systemctl restart k3s

# Verify Traefik is gone:
kubectl get pods -n kube-system | grep traefik  # should return nothing
```

---

## Step 2 — Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use template: **Edit zone DNS**
4. Under Zone Resources: **Include → Specific zone → yourdomain.com**
5. Create token and save it — you only see it once

---

## Step 3 — Install nginx-ingress

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.service.externalTrafficPolicy=Local \
  --set controller.config.use-forwarded-headers="true" \
  --set controller.config.proxy-body-size="10m" \
  --set controller.metrics.enabled=true \
  --wait

# Get the external IP assigned by k3s (this is your node IP):
kubectl get svc -n ingress-nginx ingress-nginx-controller
# Note the EXTERNAL-IP — point your router port 80/443 here
```

---

## Step 4 — Install cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.15.1 \
  --set crds.enabled=true \
  --wait

# Verify:
kubectl get pods -n cert-manager
# All 3 pods should be Running
```

---

## Step 5 — Create Cloudflare secret

```bash
# Replace with your actual token from Step 2
kubectl create secret generic cloudflare-api-token \
  --from-literal=api-token=YOUR_CLOUDFLARE_API_TOKEN \
  --namespace cert-manager

# Verify (value will be base64 encoded):
kubectl get secret cloudflare-api-token -n cert-manager
```

---

## Step 6 — Apply ClusterIssuer and wildcard Certificate

```bash
# Edit cluster-bootstrap/clusterissuer.yaml — set your email and domain
kubectl apply -f cluster-bootstrap/clusterissuer.yaml

# Wait for it to be ready:
kubectl get clusterissuer letsencrypt-prod -o wide
# READY should be True (takes ~30s)

# Request the wildcard cert:
kubectl apply -f cluster-bootstrap/wildcard-cert.yaml

# Watch it issue (takes 1-3 minutes):
kubectl get certificate -n cert-manager -w
# Ready = True means success

# Debug if stuck:
kubectl describe certificate wildcard-tls -n cert-manager
kubectl get challenges -A
```

---

## Step 7 — Set up DDNS (dynamic IP updater)

```bash
kubectl apply -f ddns/ddns-updater.yaml
# This runs every 5 minutes, updates your Cloudflare A record if your IP changes
```

---

## Step 8 — Set up Cloudflare DNS records

In Cloudflare dashboard for your domain:
1. **A record**: `@` → your current public IP — **Proxy: OFF (grey cloud)**
2. **CNAME record**: `*` → `yourdomain.com` — **Proxy: OFF (grey cloud)**

> ⚠️ Proxy MUST be OFF (DNS-only) for cert-manager DNS-01 to work.
> You can re-enable it per-subdomain after certs are issued if you want Cloudflare proxy benefits.

---

## Step 9 — Deploy SiteScope

```bash
# Create namespace
kubectl apply -f sitescope/namespace.yaml

# Create image pull secret for ghcr.io
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace sitescope

# Apply everything
kubectl apply -f sitescope/

# Watch rollout:
kubectl rollout status deployment/sitescope-backend -n sitescope
kubectl rollout status deployment/sitescope-frontend -n sitescope
```

---

## Verify end-to-end

```bash
# Check cert is valid:
curl -sv https://sitescope.yourdomain.com/health 2>&1 | grep "SSL certificate"

# Check all pods healthy:
kubectl get pods -n sitescope
kubectl get pods -n ingress-nginx
kubectl get pods -n cert-manager
```
