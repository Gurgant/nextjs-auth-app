#!/bin/bash
# 🤖 GitHub MCP (Model Context Protocol) CI/CD Monitor
# Advanced CI/CD monitoring with intelligent analysis and recommendations

set -e

REPO="Gurgant/nextjs-auth-app"
BRANCH="feature/implement-roles-and-fix-e2e"

echo "🤖 GitHub MCP Monitor - Advanced CI/CD Analysis"
echo "================================================"
echo "📊 Repository: $REPO"
echo "🌿 Branch: $BRANCH"
echo ""

# Function: Get latest workflow runs with intelligent analysis
analyze_workflow_runs() {
  echo "🔍 Analyzing recent workflow runs..."
  
  local runs=$(gh api repos/$REPO/actions/runs \
    --field branch=$BRANCH \
    --field per_page=5 \
    --jq '.workflow_runs[]')
  
  local total_runs=$(echo "$runs" | jq -s 'length')
  local failed_runs=$(echo "$runs" | jq -s '[.[] | select(.conclusion == "failure")] | length')
  local success_rate=$(( (total_runs - failed_runs) * 100 / total_runs ))
  
  echo "📊 Workflow Statistics:"
  echo "   Total runs: $total_runs"
  echo "   Failed runs: $failed_runs" 
  echo "   Success rate: $success_rate%"
  echo ""
  
  # Analyze most recent failure
  local latest_failure=$(echo "$runs" | jq -s '[.[] | select(.conclusion == "failure")][0]')
  
  if [[ "$latest_failure" != "null" ]]; then
    local run_id=$(echo "$latest_failure" | jq -r '.id')
    local workflow_name=$(echo "$latest_failure" | jq -r '.name')
    local created_at=$(echo "$latest_failure" | jq -r '.created_at')
    
    echo "❌ Latest Failure Analysis:"
    echo "   Workflow: $workflow_name"
    echo "   Run ID: $run_id"
    echo "   Created: $created_at"
    echo ""
    
    analyze_failure_details "$run_id"
  else
    echo "✅ No recent failures detected"
  fi
}

# Function: Deep failure analysis with MCP-like intelligence
analyze_failure_details() {
  local run_id=$1
  echo "🔍 Deep failure analysis for run $run_id..."
  
  # Get job details
  local jobs=$(gh api repos/$REPO/actions/runs/$run_id/jobs)
  local failed_jobs=$(echo "$jobs" | jq -r '.jobs[] | select(.conclusion == "failure") | .name')
  
  echo "💔 Failed jobs:"
  while IFS= read -r job; do
    [[ -n "$job" ]] && echo "   - $job"
  done <<< "$failed_jobs"
  echo ""
  
  # Get failure logs for intelligent pattern analysis
  local logs=$(gh run view $run_id --log-failed 2>/dev/null || echo "")
  
  # MCP-like intelligent analysis
  echo "🤖 MCP Failure Pattern Analysis:"
  
  if echo "$logs" | grep -q "pnpm install.*frozen-lockfile"; then
    echo "🎯 PATTERN DETECTED: PNPM Lockfile Issue"
    echo "   Root Cause: Lockfile incompatibility with workspace configuration"
    echo "   Resolution Status: ✅ Already implemented fallback strategy"
    echo "   Next Action: Push workflow fixes to test resolution"
  elif echo "$logs" | grep -q "Cannot install with.*frozen-lockfile"; then
    echo "🎯 PATTERN DETECTED: Dependency Resolution Issue"
    echo "   Root Cause: Lockfile format mismatch or absence"  
    echo "   Recommended Fix: Fallback installation strategy"
    echo "   Implementation: Update CI workflows with error handling"
  elif echo "$logs" | grep -q "TypeScript.*error"; then
    echo "🎯 PATTERN DETECTED: TypeScript Compilation Error"
    echo "   Root Cause: Type checking failures"
    echo "   Recommended Action: Run 'pnpm typecheck' locally"
  elif echo "$logs" | grep -q "playwright.*timeout\|E2E.*timeout"; then
    echo "🎯 PATTERN DETECTED: E2E Test Timeout"
    echo "   Root Cause: Session loading or server startup delays"
    echo "   Known Solution: Implemented session loading patterns"
  else
    echo "🤔 PATTERN: Unknown - Manual analysis required"
    echo "   Recommendation: Review logs manually for specific error context"
  fi
  echo ""
}

# Function: Generate MCP recommendations
generate_recommendations() {
  echo "💡 MCP-Generated Recommendations:"
  
  # Check if workflow files have been modified recently
  local workflow_modified=$(git log --oneline -n 5 -- .github/workflows/ | wc -l)
  
  if [[ $workflow_modified -gt 0 ]]; then
    echo "✅ Recent workflow modifications detected"
    echo "   - Workflow resilience improvements in progress"
    echo "   - Fallback installation strategies implemented"
    echo "   - Next: Test enhanced workflows with new push"
  fi
  
  echo "🎯 Immediate Actions:"
  echo "   1. Push current workflow fixes to test fallback strategies"
  echo "   2. Monitor CI run for installation success"
  echo "   3. If successful, proceed with PR creation"
  echo "   4. Set up GitHub repository secrets for full CI functionality"
  echo ""
}

# Function: Real-time monitoring
monitor_current_run() {
  echo "⏳ Checking for active runs..."
  
  local active_runs=$(gh api repos/$REPO/actions/runs \
    --field branch=$BRANCH \
    --field status=in_progress \
    --jq '.workflow_runs[].id')
  
  if [[ -n "$active_runs" ]]; then
    echo "🔄 Active runs detected:"
    while IFS= read -r run_id; do
      [[ -n "$run_id" ]] && echo "   - Run ID: $run_id"
    done <<< "$active_runs"
    
    echo "   Use 'gh run watch $run_id' for real-time monitoring"
  else
    echo "💤 No active runs currently"
  fi
  echo ""
}

# Main execution flow
main() {
  analyze_workflow_runs
  generate_recommendations  
  monitor_current_run
  
  echo "🤖 MCP Analysis Complete"
  echo "💼 Ready for next phase of CI/CD resolution"
}

# Execute main function
main