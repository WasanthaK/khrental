#!/bin/bash

# Script to redeploy the webhook function after fixing the processed column issue

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Redeploying Evia Sign webhook function to Supabase...${NC}"

# Check if supabase CLI is installed
if ! [ -x "$(command -v supabase)" ]; then
  echo -e "${RED}Error: supabase CLI is not installed.${NC}"
  echo "Please install it first: https://supabase.com/docs/reference/cli/usage"
  exit 1
fi

# Remind the user to run the SQL fix first
echo -e "${YELLOW}Important:${NC} Make sure you've run the SQL fix for the webhook_events table first!"
echo "If you haven't done this yet, please run the SQL commands in docs/fix-webhook-events-table.md"
read -p "Have you already fixed the webhook_events table? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${RED}Please fix the webhook_events table first.${NC}"
  echo "See docs/fix-webhook-events-table.md for instructions."
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
echo -e "${YELLOW}Redeploying evia-webhook function...${NC}"
supabase functions deploy evia-webhook

if [ $? -eq 0 ]; then
  echo -e "${GREEN}Redeployment successful!${NC}"
  
  # Get the project reference
  PROJECT_REF=$(supabase projects list --format=json | grep 'ref' | cut -d'"' -f4)
  
  if [ -n "$PROJECT_REF" ]; then
    WEBHOOK_URL="https://$PROJECT_REF.supabase.co/functions/v1/evia-webhook"
    echo -e "${GREEN}Your webhook URL is:${NC}"
    echo -e "${YELLOW}$WEBHOOK_URL${NC}"
    
    # Test the webhook
    echo -e "${YELLOW}Testing webhook access...${NC}"
    curl -I "$WEBHOOK_URL" 2>/dev/null | head -n 1
    
    echo ""
    echo -e "${YELLOW}Running webhook test script...${NC}"
    echo -e "This will send a test webhook event to verify everything is working correctly."
    read -p "Do you want to run the test script? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      node scripts/test-webhook.js
    fi
  else
    echo -e "${RED}Could not determine project reference.${NC}"
  fi
else
  echo -e "${RED}Redeployment failed.${NC}"
  exit 1
fi

echo -e "${GREEN}Done!${NC}"
echo "The webhook function has been redeployed with improvements to handle the processed column." 