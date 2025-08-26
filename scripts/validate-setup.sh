# Personal Finance Hub - Setup Validation Script
# Pateta o DEV - Complete System Validation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

# Quick health check
quick_check() {
    print_status "Running quick health check..."

    local critical_services=("pfh-postgres-master" "pfh-mongo-primary" "pfh-redis-master")
    local all_ok=true

    for service in "${critical_services[@]}"; do
        if docker ps --format "table {{.Names}}" | grep -q "^$service$"; then
            print_success "$service is running"
        else
            print_error "$service is not running"
            all_ok=false
        fi
    done

    if $all_ok; then
        print_success "✅ Critical services are running"
        return 0
    else
        print_error "❌ Some critical services are down"
        return 1
    fi
}

# Show usage
show_usage() {
    echo "Personal Finance Hub - Setup Validation Script"
    echo "Pateta o DEV - Complete System Validation"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  quick             Quick health check of critical services"
    echo "  help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                # Quick health check"
    echo "  $0 quick          # Same as above"
    echo ""
}

# Main function
main() {
    local command=${1:-quick}

    case "$command" in
        quick)
            quick_check
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            print_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Check if running directly or being sourced
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    echo "=============================================="
    echo "🔍 Personal Finance Hub - System Validation"
    echo "   Pateta o DEV - Com    echo "   Pateta o DEV - Com    echo "   Pateta o DE============================="
    echo ""

    main "$@"

    echo ""
    echo "=============================================="
fi

