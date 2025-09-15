#!/bin/bash

# AI Analysis Service Deployment Script
# This script builds and deploys the AI Analysis Service to Kubernetes

set -e

# Configuration
SERVICE_NAME="ai-analysis-service"
NAMESPACE="forensic-evidence"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-localhost:5000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    if ! command -v kind &> /dev/null; then
        log_warning "kind is not installed, assuming external Kubernetes cluster"
    fi
    
    log_success "Dependencies check passed"
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    
    docker build -t ${SERVICE_NAME}:${IMAGE_TAG} .
    
    if [ $? -eq 0 ]; then
        log_success "Docker image built successfully"
    else
        log_error "Failed to build Docker image"
        exit 1
    fi
}

# Tag image for registry
tag_image() {
    log_info "Tagging image for registry..."
    
    docker tag ${SERVICE_NAME}:${IMAGE_TAG} ${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}
    
    log_success "Image tagged for registry"
}

# Push image to registry
push_image() {
    log_info "Pushing image to registry..."
    
    docker push ${REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}
    
    if [ $? -eq 0 ]; then
        log_success "Image pushed to registry successfully"
    else
        log_error "Failed to push image to registry"
        exit 1
    fi
}

# Create namespace
create_namespace() {
    log_info "Creating namespace..."
    
    kubectl apply -f k8s/namespace.yaml
    
    log_success "Namespace created"
}

# Apply Kubernetes manifests
apply_manifests() {
    log_info "Applying Kubernetes manifests..."
    
    # Apply ConfigMap
    kubectl apply -f k8s/configmap.yaml
    
    # Apply Secret
    kubectl apply -f k8s/secret.yaml
    
    # Apply Deployment
    kubectl apply -f k8s/deployment.yaml
    
    # Apply Service
    kubectl apply -f k8s/service.yaml
    
    # Apply Ingress
    kubectl apply -f k8s/ingress.yaml
    
    # Apply HPA
    kubectl apply -f k8s/hpa.yaml
    
    log_success "Kubernetes manifests applied"
}

# Wait for deployment to be ready
wait_for_deployment() {
    log_info "Waiting for deployment to be ready..."
    
    kubectl wait --for=condition=available --timeout=300s deployment/${SERVICE_NAME} -n ${NAMESPACE}
    
    if [ $? -eq 0 ]; then
        log_success "Deployment is ready"
    else
        log_error "Deployment failed to become ready"
        exit 1
    fi
}

# Check deployment status
check_status() {
    log_info "Checking deployment status..."
    
    kubectl get pods -n ${NAMESPACE} -l app=${SERVICE_NAME}
    kubectl get services -n ${NAMESPACE} -l app=${SERVICE_NAME}
    kubectl get ingress -n ${NAMESPACE}
    kubectl get hpa -n ${NAMESPACE}
}

# Run health checks
health_check() {
    log_info "Running health checks..."
    
    # Get service URL
    SERVICE_URL=$(kubectl get service ${SERVICE_NAME} -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}')
    
    if [ -z "$SERVICE_URL" ]; then
        log_error "Could not get service URL"
        return 1
    fi
    
    # Port forward for health check
    kubectl port-forward service/${SERVICE_NAME} 8001:8001 -n ${NAMESPACE} &
    PORT_FORWARD_PID=$!
    
    # Wait for port forward to be ready
    sleep 5
    
    # Run health check
    if curl -f http://localhost:8001/health; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        kill $PORT_FORWARD_PID 2>/dev/null
        return 1
    fi
    
    # Clean up port forward
    kill $PORT_FORWARD_PID 2>/dev/null
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Kill any background processes
    jobs -p | xargs -r kill
    
    log_success "Cleanup completed"
}

# Main deployment function
deploy() {
    log_info "Starting deployment of ${SERVICE_NAME}..."
    
    check_dependencies
    build_image
    tag_image
    push_image
    create_namespace
    apply_manifests
    wait_for_deployment
    check_status
    health_check
    
    log_success "Deployment completed successfully!"
    log_info "Service is available at: http://ai-analysis.forensic-evidence.local"
    log_info "API Documentation: http://ai-analysis.forensic-evidence.local/api/docs"
}

# Rollback function
rollback() {
    log_info "Rolling back deployment..."
    
    kubectl rollout undo deployment/${SERVICE_NAME} -n ${NAMESPACE}
    kubectl rollout status deployment/${SERVICE_NAME} -n ${NAMESPACE}
    
    log_success "Rollback completed"
}

# Delete function
delete() {
    log_info "Deleting deployment..."
    
    kubectl delete -f k8s/ --ignore-not-found=true
    
    log_success "Deployment deleted"
}

# Show usage
usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  deploy     Deploy the service (default)"
    echo "  rollback   Rollback to previous version"
    echo "  delete     Delete the deployment"
    echo "  status     Check deployment status"
    echo "  health     Run health checks"
    echo "  help       Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  IMAGE_TAG  Docker image tag (default: latest)"
    echo "  REGISTRY   Docker registry (default: localhost:5000)"
}

# Main script logic
main() {
    # Set up trap for cleanup
    trap cleanup EXIT
    
    case "${1:-deploy}" in
        deploy)
            deploy
            ;;
        rollback)
            rollback
            ;;
        delete)
            delete
            ;;
        status)
            check_status
            ;;
        health)
            health_check
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
