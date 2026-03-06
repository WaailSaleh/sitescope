# Setting up KUBE_CONFIG for GitHub Actions
#
# The pipeline needs kubectl access to your k3s cluster.
# This guide shows the SECURE way — a dedicated ServiceAccount with
# minimum permissions, not your admin kubeconfig.

## Option A — Recommended: Scoped ServiceAccount (least privilege)

# 1. Create a deploy ServiceAccount with only what Actions needs
kubectl apply -f - <<EOF
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: github-actions-deployer
  namespace: sitescope

---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: deployer
  namespace: sitescope
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch", "update"]
  - apiGroups: ["apps"]
    resources: ["deployments/status"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["pods", "services", "events", "configmaps"]
    verbs: ["get", "list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list", "create", "update", "patch"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: github-actions-deployer
  namespace: sitescope
subjects:
  - kind: ServiceAccount
    name: github-actions-deployer
    namespace: sitescope
roleRef:
  kind: Role
  name: deployer
  apiGroup: rbac.authorization.k8s.io
EOF

# 2. Create a long-lived token for the ServiceAccount
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: github-actions-deployer-token
  namespace: sitescope
  annotations:
    kubernetes.io/service-account.name: github-actions-deployer
type: kubernetes.io/service-account-token
EOF

# 3. Extract the token
TOKEN=$(kubectl get secret github-actions-deployer-token -n sitescope -o jsonpath='{.data.token}' | base64 -d)
CLUSTER_SERVER=$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}')
CA=$(kubectl get secret github-actions-deployer-token -n sitescope -o jsonpath='{.data.ca\.crt}')

# 4. Build a minimal kubeconfig
cat > /tmp/github-actions-kubeconfig.yaml <<KUBECONFIG
apiVersion: v1
kind: Config
clusters:
  - name: home-k3s
    cluster:
      server: ${CLUSTER_SERVER}
      certificate-authority-data: ${CA}
contexts:
  - name: github-actions
    context:
      cluster: home-k3s
      user: github-actions-deployer
      namespace: sitescope
current-context: github-actions
users:
  - name: github-actions-deployer
    user:
      token: ${TOKEN}
KUBECONFIG

# 5. Verify it works
kubectl --kubeconfig /tmp/github-actions-kubeconfig.yaml get pods -n sitescope

# 6. Base64 encode and add to GitHub secrets
cat /tmp/github-actions-kubeconfig.yaml | base64 -w 0
# Copy the output → GitHub repo → Settings → Secrets → Actions → KUBE_CONFIG

# 7. Clean up local file
rm /tmp/github-actions-kubeconfig.yaml


## Option B — Quick and dirty: use your admin kubeconfig
## Only do this for private repos you fully control.

# Make sure the server address is your node's LAN IP or public IP
# (not 127.0.0.1 — Actions runs on GitHub's servers)
cat ~/.kube/config | base64 -w 0
# Paste output into KUBE_CONFIG secret

# ⚠️ If k3s is only accessible on LAN, you'll need to either:
#   a) Open kubectl port (6443) on your router and firewall (security risk)
#   b) Use a GitHub Actions self-hosted runner on your LAN (recommended for private clusters)
#      See: https://docs.github.com/en/actions/hosting-your-own-runners


## Self-hosted runner (best for home lab with no public kubectl port)

# On a machine on your LAN:
# 1. Go to your GitHub repo → Settings → Actions → Runners → New self-hosted runner
# 2. Follow the Linux setup instructions
# 3. In deploy.yml, change:
#      runs-on: ubuntu-latest
#    to:
#      runs-on: self-hosted
# 4. The runner has LAN access to your k3s API — no need to expose port 6443

echo "See comments above for setup instructions"
