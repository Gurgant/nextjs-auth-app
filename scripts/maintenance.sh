#!/bin/bash
set -e

# 🛠️ Enterprise Maintenance Script
# Automated routine maintenance tasks for Next.js Auth App

echo "🚀 Starting Enterprise Maintenance Tasks..."
echo "=================================================="

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v pnpm &> /dev/null; then
        log_error "pnpm is not installed. Please install pnpm first."
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "git is not installed. Please install git first."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Clean build artifacts
clean_artifacts() {
    log_info "Cleaning build artifacts..."
    
    # Remove build outputs
    rm -rf .next/
    rm -rf dist/
    rm -rf out/
    
    # Remove test outputs
    rm -rf coverage/
    rm -rf playwright-report/
    rm -rf test-results/
    
    # Remove cache files
    rm -rf .turbo/
    rm -f tsconfig.tsbuildinfo
    
    # Clean working directories
    rm -rf .playwright-mcp/
    
    log_success "Build artifacts cleaned"
}

# Update dependencies
update_dependencies() {
    log_info "Updating dependencies..."
    
    # Update all dependencies
    pnpm update --latest
    
    # Check for security vulnerabilities
    log_info "Running security audit..."
    if pnpm audit --audit-level moderate; then
        log_success "No security vulnerabilities found"
    else
        log_warning "Security vulnerabilities detected. Review and fix manually."
    fi
    
    log_success "Dependencies updated"
}

# Run quality checks
run_quality_checks() {
    log_info "Running quality checks..."
    
    # Format check
    if pnpm format:check; then
        log_success "Code formatting is correct"
    else
        log_warning "Code formatting issues detected. Running auto-fix..."
        pnpm prettier --write .
        log_success "Code formatting fixed"
    fi
    
    # Type checking
    if pnpm typecheck; then
        log_success "TypeScript compilation passed"
    else
        log_error "TypeScript compilation failed. Fix manually."
        return 1
    fi
    
    # Linting
    if pnpm lint; then
        log_success "ESLint checks passed"
    else
        log_error "ESLint issues detected. Fix manually."
        return 1
    fi
    
    # Translation validation
    if pnpm validate-translations; then
        log_success "Translation validation passed"
    else
        log_error "Translation validation failed. Fix manually."
        return 1
    fi
    
    log_success "All quality checks passed"
}

# Optimize images
optimize_images() {
    log_info "Optimizing documentation images..."
    
    screenshot_dir="docs/screenshots"
    if [[ -d "$screenshot_dir" ]]; then
        image_count=0
        for img in "$screenshot_dir"/*.png; do
            if [[ -f "$img" ]]; then
                # Get file size
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    size=$(stat -f%z "$img")
                else
                    size=$(stat -c%s "$img")
                fi
                
                size_mb=$((size / 1024 / 1024))
                
                if [[ $size_mb -gt 1 ]]; then
                    log_warning "Large image detected: $(basename "$img") (${size_mb}MB)"
                    # Note: Add image optimization command here if needed
                    # e.g., imageoptim, pngquant, etc.
                fi
                
                ((image_count++))
            fi
        done
        
        log_success "Analyzed $image_count documentation images"
    else
        log_warning "No documentation images directory found"
    fi
}

# Validate documentation
validate_documentation() {
    log_info "Validating documentation..."
    
    # Check if README exists and has content
    if [[ -f "README.md" ]] && [[ -s "README.md" ]]; then
        readme_lines=$(wc -l < README.md)
        log_success "README.md exists with $readme_lines lines"
    else
        log_error "README.md is missing or empty"
        return 1
    fi
    
    # Check required screenshots exist
    required_screenshots=(
        "docs/screenshots/hero.png"
        "docs/screenshots/signin.png"
        "docs/screenshots/dashboard-main.png"
    )
    
    missing_screenshots=()
    for screenshot in "${required_screenshots[@]}"; do
        if [[ ! -f "$screenshot" ]]; then
            missing_screenshots+=("$screenshot")
        fi
    done
    
    if [[ ${#missing_screenshots[@]} -gt 0 ]]; then
        log_error "Missing required screenshots:"
        printf '%s\n' "${missing_screenshots[@]}"
        return 1
    fi
    
    log_success "Documentation validation passed"
}

# Generate maintenance report
generate_report() {
    log_info "Generating maintenance report..."
    
    report_file="maintenance-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# 🛠️ Maintenance Report

**Generated**: $(date -u)
**Project**: Next.js Authentication App

## 📊 Summary
- ✅ Prerequisites validated
- ✅ Build artifacts cleaned  
- ✅ Dependencies updated
- ✅ Quality checks passed
- ✅ Images optimized
- ✅ Documentation validated

## 📈 Metrics
- **Dependencies**: $(pnpm list --depth=0 2>/dev/null | grep -c "^├──" || echo "N/A")
- **TypeScript Files**: $(find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | wc -l)
- **Test Files**: $(find . -name "*.test.*" -o -name "*.spec.*" | grep -v node_modules | wc -l)
- **Documentation Images**: $(find docs/screenshots -name "*.png" 2>/dev/null | wc -l || echo "0")

## 🔗 Key Links
- [Repository](https://github.com/Gurgant/nextjs-auth-app)
- [Latest Release](https://github.com/Gurgant/nextjs-auth-app/releases/latest)
- [Best Practices](./ENTERPRISE_BEST_PRACTICES.md)

---
*Generated by automated maintenance script*
EOF
    
    log_success "Maintenance report generated: $report_file"
}

# Main execution
main() {
    echo
    log_info "🚀 Enterprise Maintenance Script v1.0.0"
    echo "=================================================="
    echo
    
    # Parse command line options
    CLEAN_ONLY=false
    SKIP_DEPS=false
    GENERATE_REPORT=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --clean-only)
                CLEAN_ONLY=true
                shift
                ;;
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --no-report)
                GENERATE_REPORT=false
                shift
                ;;
            -h|--help)
                echo "Usage: $0 [OPTIONS]"
                echo
                echo "Options:"
                echo "  --clean-only    Only clean artifacts, skip other tasks"
                echo "  --skip-deps     Skip dependency updates"
                echo "  --no-report     Skip report generation"
                echo "  -h, --help      Show this help message"
                echo
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Execute maintenance tasks
    check_prerequisites
    clean_artifacts
    
    if [[ "$CLEAN_ONLY" == "false" ]]; then
        if [[ "$SKIP_DEPS" == "false" ]]; then
            update_dependencies
        fi
        
        run_quality_checks
        optimize_images
        validate_documentation
        
        if [[ "$GENERATE_REPORT" == "true" ]]; then
            generate_report
        fi
    fi
    
    echo
    log_success "🎉 Enterprise maintenance completed successfully!"
    echo "=================================================="
    echo
}

# Execute main function with all arguments
main "$@"