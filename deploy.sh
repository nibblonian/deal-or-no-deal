#!/bin/bash

# Configuration
PI_HOST="pi@rpi.local"
PI_PATH="/home/pi/code/deal-or-no-deal"
SSH_CMD="/usr/bin/ssh -tt"


# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test SSH connection first
echo "Testing SSH connection..."
if ! $SSH_CMD -q $PI_HOST "exit"; then
    echo -e "${RED}SSH connection failed. Please check your connection.${NC}"
    exit 1
fi

echo -e "${GREEN}SSH connection successful${NC}"

# Create directory on Pi if it doesn't exist
echo "Creating directory if needed..."
ssh $PI_HOST "mkdir -p $PI_PATH"

# Sync files with progress
echo "Syncing files to Raspberry Pi..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    --exclude 'deploy.sh' \
    ./ $PI_HOST:$PI_PATH/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Deploy successful!${NC}"
else
    echo -e "${RED}Deploy failed!${NC}"
    exit 1
fi