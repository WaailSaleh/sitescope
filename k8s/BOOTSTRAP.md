# Cluster Bootstrap — One-Time Setup

Run these steps **once** on a machine with `kubectl` pointing at your k3s cluster.
After this, everything is managed by GitHub Actions and manifests.

## Prerequisites
- k3s cluster running with kubectl access
- Cloudflare account with your domain, and a Tunnel created
- GitHub repo with `SUBDOMAIN` variable and `GHCR_TOKEN` secret set

---

## Step 1 — Create image pull secret

```bash
kubectl create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --namespace sitescope
```

---

## Step 2 — Create Cloudflare Tunnel token secret

Get your tunnel token from: Cloudflare Zero Trust → Networks → Tunnels → your tunnel

```bash
kubectl create secret generic tunnel-token \
  --from-literal=token=YOUR_TUNNEL_TOKEN \
  --namespace cloudflared
```

This secret persists across deployments. CI never touches it.
To rotate: re-run the above command then `kubectl rollout restart deployment/cloudflared -n cloudflared`.

---

## Step 3 — Configure Cloudflare Tunnel public hostname

In the Cloudflare dashboard: Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames → Add

| Field    | Value                                          |
|----------|------------------------------------------------|
| Hostname | sitescope.jidka.org                            |
| Service  | HTTP                                           |
| URL      | traefik.kube-system.svc.cluster.local:80       |

---

## Step 4 — Initial deploy

Push to master or trigger the GitHub Actions workflow manually.
The pipeline builds images, applies manifests, and waits for healthy rollout.

---

## Verify

```bash
# All pods healthy
kubectl get pods -n sitescope
kubectl get pods -n cloudflared

# Tunnel connected
kubectl logs -n cloudflared -l app=cloudflared --tail=5 | grep "Registered tunnel"

# Site reachable through tunnel (cf-ray header confirms Cloudflare edge)
curl -sI https://sitescope.jidka.org | grep cf-ray
```
