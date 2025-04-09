#!/bin/bash

# Script to deploy the Evia Sign webhook function to Supabase

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying Evia Sign webhook function to Supabase...${NC}"

# Check if supabase CLI is installed
if ! [ -x "$(command -v supabase)" ]; then
  echo -e "${RED}Error: supabase CLI is not installed.${NC}"
  echo "Please install it first: https://supabase.com/docs/reference/cli/usage"
  exit 1
fi

# Login to Supabase if needed
echo -e "${YELLOW}Checking Supabase login status...${NC}"
supabase functions list > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}Please login to Supabase:${NC}"
  supabase login
fi

# Deploy the webhook function
echo -e "${YELLOW}Deploying evia-webhook function...${NC}"
supabase functions deploy evia-webhook

if [ $? -eq 0 ]; then
  # Get the project reference
  PROJECT_REF=$(supabase projects list --format=json | grep 'ref' | cut -d'"' -f4)
  
  if [ -n "$PROJECT_REF" ]; then
    WEBHOOK_URL="https://$PROJECT_REF.supabase.co/functions/v1/evia-webhook"
    echo -e "${GREEN}Deployment successful!${NC}"
    echo -e "${GREEN}Your webhook URL is:${NC}"
    echo -e "${YELLOW}$WEBHOOK_URL${NC}"
    echo ""
    echo -e "${YELLOW}Add this URL to your .env file:${NC}"
    echo "VITE_EVIA_WEBHOOK_URL=$WEBHOOK_URL"
    
    # Offer to update the .env file automatically
    read -p "Do you want to update your .env file automatically? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      # Check if .env file exists
      if [ -f ".env" ]; then
        # Check if VITE_EVIA_WEBHOOK_URL already exists in .env
        if grep -q "VITE_EVIA_WEBHOOK_URL" .env; then
          # Replace the existing line
          sed -i "s|VITE_EVIA_WEBHOOK_URL=.*|VITE_EVIA_WEBHOOK_URL=$WEBHOOK_URL|" .env
        else
          # Add the new line
          echo "VITE_EVIA_WEBHOOK_URL=$WEBHOOK_URL" >> .env
        fi
        echo -e "${GREEN}.env file updated successfully!${NC}"
      else
        echo "VITE_EVIA_WEBHOOK_URL=$WEBHOOK_URL" > .env
        echo -e "${GREEN}.env file created successfully!${NC}"
      fi
    fi
  else
    echo -e "${RED}Could not determine project reference.${NC}"
    echo -e "${YELLOW}Please set your webhook URL manually in the .env file:${NC}"
    echo "VITE_EVIA_WEBHOOK_URL=https://your-project-ref.supabase.co/functions/v1/evia-webhook"
  fi
else
  echo -e "${RED}Deployment failed.${NC}"
  exit 1
fi

echo -e "${YELLOW}Testing webhook access...${NC}"
curl -I "$WEBHOOK_URL" 2>/dev/null | head -n 1

echo ""
echo -e "${GREEN}Done!${NC}" 