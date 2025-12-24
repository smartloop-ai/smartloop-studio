#!/bin/bash
# Gathers all requirements for the Docker file, builds it, and then pushes it to ECR.

set -eo pipefail

if [[ $1 && $2 ]]; then :
else
    printf '\nPlease supply an Azure profile, an Azure region, and an ACR repository.\n'
    printf '\n\tExample: bash docker_build_and_push.sh default us-west-2 sl-dev-ecr\n\n\n'
    exit
fi

DOCKER_DIR="."
PROJECT_ID="$1"
IMAGE_NAME="$2"
REGISTRY=${3:-gcr.io}  # Default to gcr.io if not specified
TAG="latest"
REGION="us-west1"

readonly DATE_STAMP=$(date +%Y%0m%0d-%0H%0M)

# Authenticate with Google Cloud
echo "Authenticating with Google Cloud..."
gcloud auth configure-docker --quiet

printf '\nBuilding Docker Image.\n'

docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" "$DOCKER_DIR/."

# Tag the image for GCR
echo "Tagging the Docker image..."
docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${TAG}
docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${DATE_STAMP}

# Push the image to GCR
echo "Pushing Docker image to GCR..."
docker push ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${TAG}
docker push ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${DATE_STAMP}

echo "Docker image pushed successfully to ${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${TAG}"
