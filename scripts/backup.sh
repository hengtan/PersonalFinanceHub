#!/bin/bash

# Personal Finance Hub - Backup Script
# Pateta o DEV - Complete Data Backup System

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="pfh_backup_$TIMESTAMP"

# Database configuration
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
POSTGRES_DB="personal_finance"
POSTGRES_USER="pfh_admin"
POSTGRES_PASSWORD="pfh_secure_2024"

MONGODB_HOST="localhost"
MONGODB_PORT="27017"
MONGODB_DB="personal_finance_read"
MONGODB_USER="pfh_admin"
MONGODB_PASSWORD="mongo_secure_2024"

# Create backup directory
create_backup_dir() {
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"
    print_status "Created backup directory: $BACKUP_DIR/$BACKUP_NAME"
}

# Backup PostgreSQL database
backup_postgresql() {
    print_status "Backing up PostgreSQL database..."

    local backup_file="$BACKUP_DIR/$BACKUP_NAME/postgresql_backup.sql"

    PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
        -h $POSTGRES_HOST \
        -p $POSTGRES_PORT \
        -U $POSTGRES_USER \
        -d $POSTGRES_DB \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=plain \
        > "$backup_file"

    if [ $? -eq 0 ]; then
        local file_size=$(du -h "$backup_file" | cut -f1)
        print_success "PostgreSQL backup completed ($file_size)"
    else
        print_error "PostgreSQL backup failed!"
        exit 1
    fi
}

# Backup PostgreSQL schema only
backup_postgresql_schema() {
    print_status "Backing up PostgreSQL schema..."

    local schema_file="$BACKUP_DIR/$BACKUP_NAME/postgresql_schema.sql"

    PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
        -h $POSTGRES_HOST \
        -p $POSTGRES_PORT \
        -U $POSTGRES_USER \
        -d $POSTGRES_DB \
        --schema-only \
        --verbose \
        --clean \
        --if-exists \
        --create \
        > "$schema_file"

    print_success "PostgreSQL schema backup completed"
}

# Backup MongoDB database
backup_mongodb() {
    print_status "Backing up MongoDB database..."

    local backup_dir="$BACKUP_DIR/$BACKUP_NAME/mongodb"
    mkdir -p "$backup_dir"

    docker exec pfh-mongo-primary mongodump \
        --host localhost:27017 \
        --username $MONGODB_USER \
        --password $MONGODB_PASSWORD \
        --authenticationDatabase admin \
        --db $MONGODB_DB \
        --out /tmp/mongodb_backup

    # Copy from container to host
    docker cp pfh-mongo-primary:/tmp/mongodb_backup/$MONGODB_DB "$backup_dir/"

    # Cleanup container
    docker exec pfh-mongo-primary rm -rf /tmp/mongodb_backup

    if [ -d "$backup_dir/$MONGODB_DB" ]; then
        local dir_size=$(du -sh "$backup_dir" | cut -f1)
        print_success "MongoDB backup completed ($dir_size)"
    else
        print_error "MongoDB backup failed!"
        exit 1
    fi
}

# Backup Redis data
backup_redis() {
    print_status "Backing up Redis data..."

    local backup_file="$BACKUP_DIR/$BACKUP_NAME/redis_backup.rdb"

    # Trigger Redis save
    docker exec pfh-redis-master redis-cli BGSAVE

    # Wait for background save to complete
    while [ "$(docker exec pfh-redis-master redis-cli LASTSAVE)" = "$(docker exec pfh-redis-master redis-cli LASTSAVE)" ]; do
        sleep 1
    done

    # Copy RDB file
    docker cp pfh-redis-master:/data/dump.rdb "$backup_file"

    if [ -f "$backup_file" ]; then
        local file_size=$(du -h "$backup_file" | cut -f1)
        print_success "Redis backup completed ($file_size)"
    else
        print_warning "Redis backup file not found - may be empty cache"
        touch "$backup_file"  # Create empty file for consistency
    fi
}

# Backup application configuration
backup_config() {
    print_status "Backing up configuration files..."

    local config_dir="$BACKUP_DIR/$BACKUP_NAME/config"
    mkdir -p "$config_dir"

    # Copy important configuration files
    if [ -f ".env" ]; then
        cp ".env" "$config_dir/env.backup"
    fi

    if [ -f "docker-compose.yml" ]; then
        cp "docker-compose.yml" "$config_dir/"
    fi

    # Backup infrastructure configs
    if [ -d "infrastructure" ]; then
        cp -r "infrastructure" "$config_dir/"
    fi

    # Backup package.json files
    if [ -f "package.json" ]; then
        cp "package.json" "$config_dir/"
    fi

    if [ -f "backend/package.json" ]; then
        cp "backend/package.json" "$config_dir/backend_package.json"
    fi

    if [ -f "frontend/package.json" ]; then
        cp "frontend/package.json" "$config_dir/frontend_package.json"
    fi

    print_success "Configuration backup completed"
}

# Backup uploaded files (MinIO)
backup_minio() {
    print_status "Backing up MinIO files..."

    local minio_dir="$BACKUP_DIR/$BACKUP_NAME/minio"
    mkdir -p "$minio_dir"

    # Copy MinIO data volume
    docker cp pfh-minio:/data "$minio_dir/" || {
        print_warning "MinIO backup failed - container may not be running or no data"
        mkdir -p "$minio_dir/data"  # Create empty directory
    }

    if [ -d "$minio_dir/data" ]; then
        local dir_size=$(du -sh "$minio_dir" | cut -f1)
        print_success "MinIO backup completed ($dir_size)"
    else
        print_warning "MinIO backup incomplete"
    fi
}

# Create backup manifest
create_manifest() {
    print_status "Creating backup manifest..."

    local manifest_file="$BACKUP_DIR/$BACKUP_NAME/MANIFEST.json"

    cat > "$manifest_file" << EOF
{
  "backup_info": {
    "name": "$BACKUP_NAME",
    "timestamp": "$TIMESTAMP",
    "created_at": "$(date -Iseconds)",
    "version": "1.0.0",
    "type": "full_backup"
  },
  "system_info": {
    "hostname": "$(hostname)",
    "user": "$(whoami)",
    "os": "$(uname -s)",
    "arch": "$(uname -m)"
  },
  "components": {
    "postgresql": {
      "database": "$POSTGRES_DB",
      "host": "$POSTGRES_HOST:$POSTGRES_PORT",
      "backup_file": "postgresql_backup.sql",
      "schema_file": "postgresql_schema.sql"
    },
    "mongodb": {
      "database": "$MONGODB_DB",
      "host": "$MONGODB_HOST:$MONGODB_PORT",
      "backup_dir": "mongodb/"
    },
    "redis": {
      "backup_file": "redis_backup.rdb"
    },
    "minio": {
      "backup_dir": "minio/"
    },
    "config": {
      "backup_dir": "config/"
    }
  },
  "restore_instructions": {
    "postgresql": "psql -h localhost -U pfh_admin -d personal_finance < postgresql_backup.sql",
    "mongodb": "mongorestore --host localhost:27017 --username pfh_admin --password mongo_secure_2024 --authenticationDatabase admin --db personal_finance_read mongodb/personal_finance_read/",
    "redis": "Copy redis_backup.rdb to Redis data directory and restart Redis",
    "minio": "Copy minio/data/* to MinIO data volume"
  }
}
EOF

    print_success "Backup manifest created"
}

# Compress backup
compress_backup() {
    print_status "Compressing backup..."

    local archive_name="$BACKUP_NAME.tar.gz"
    local archive_path="$BACKUP_DIR/$archive_name"

    cd "$BACKUP_DIR"
    tar -czf "$archive_name" "$BACKUP_NAME/"

    if [ $? -eq 0 ]; then
        local archive_size=$(du -h "$archive_path" | cut -f1)
        print_success "Backup compressed: $archive_path ($archive_size)"

        # Remove uncompressed directory
        rm -rf "$BACKUP_NAME"
        print_status "Removed temporary backup directory"
    else
        print_error "Backup compression failed!"
        exit 1
    fi
}

# Cleanup old backups
cleanup_old_backups() {
    print_status "Cleaning up old backups..."

    local retention_days=${BACKUP_RETENTION_DAYS:-30}

    # Remove backups older than retention period
    find "$BACKUP_DIR" -name "pfh_backup_*.tar.gz" -type f -mtime +$retention_days -delete

    # Count remaining backups
    local remaining_count=$(find "$BACKUP_DIR" -name "pfh_backup_*.tar.gz" -type f | wc -l)

    print_success "Cleanup completed. Remaining backups: $remaining_count"
}

# Verify backup integrity
verify_backup() {
    print_status "Verifying backup integrity..."

    local archive_path="$BACKUP_DIR/$BACKUP_NAME.tar.gz"

    if [ -f "$archive_path" ]; then
        # Test archive integrity
        if tar -tzf "$archive_path" > /dev/null 2>&1; then
            print_success "Backup archive integrity verified"
        else
            print_error "Backup archive is corrupted!"
            exit 1
        fi
    else
        print_error "Backup archive not found!"
        exit 1
    fi
}

# Upload backup to cloud (optional)
upload_to_cloud() {
    if [ -n "$BACKUP_UPLOAD_ENABLED" ] && [ "$BACKUP_UPLOAD_ENABLED" = "true" ]; then
        print_status "Uploading backup to cloud storage..."

        local archive_path="$BACKUP_DIR/$BACKUP_NAME.tar.gz"

        # Example: Upload to S3 (requires AWS CLI)
        if command -v aws >/dev/null 2>&1 && [ -n "$AWS_S3_BACKUP_BUCKET" ]; then
            aws s3 cp "$archive_path" "s3://$AWS_S3_BACKUP_BUCKET/backups/" --storage-class STANDARD_IA
            if [ $? -eq 0 ]; then
                print_success "Backup uploaded to S3: s3://$AWS_S3_BACKUP_BUCKET/backups/$BACKUP_NAME.tar.gz"
            else
                print_warning "S3 upload failed"
            fi
        fi

        # Example: Upload to Google Cloud Storage (requires gsutil)
        if command -v gsutil >/dev/null 2>&1 && [ -n "$GCS_BACKUP_BUCKET" ]; then
            gsutil cp "$archive_path" "gs://$GCS_BACKUP_BUCKET/backups/"
            if [ $? -eq 0 ]; then
                print_success "Backup uploaded to GCS: gs://$GCS_BACKUP_BUCKET/backups/$BACKUP_NAME.tar.gz"
            else
                print_warning "GCS upload failed"
            fi
        fi

        # Example: Upload via SCP (requires SSH keys)
        if [ -n "$BACKUP_REMOTE_HOST" ] && [ -n "$BACKUP_REMOTE_PATH" ]; then
            scp "$archive_path" "$BACKUP_REMOTE_HOST:$BACKUP_REMOTE_PATH/"
            if [ $? -eq 0 ]; then
                print_success "Backup uploaded via SCP: $BACKUP_REMOTE_HOST:$BACKUP_REMOTE_PATH/"
            else
                print_warning "SCP upload failed"
            fi
        fi
    else
        print_status "Cloud upload disabled or not configured"
    fi
}

# Send notification
send_notification() {
    local status=$1
    local message=$2

    if [ -n "$NOTIFICATION_WEBHOOK_URL" ]; then
        local payload=$(cat << EOF
{
    "text": "🏦 Personal Finance Hub Backup",
    "attachments": [
        {
            "color": "$([[ $status == "success" ]] && echo "good" || echo "danger")",
            "fields": [
                {
                    "title": "Status",
                    "value": "$status",
                    "short": true
                },
                {
                    "title": "Backup Name",
                    "value": "$BACKUP_NAME",
                    "short": true
                },
                {
                    "title": "Timestamp",
                    "value": "$TIMESTAMP",
                    "short": true
                },
                {
                    "title": "Message",
                    "value": "$message",
                    "short": false
                }
            ]
        }
    ]
}
EOF
        )

        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$NOTIFICATION_WEBHOOK_URL" \
            --silent > /dev/null
    fi

    if [ -n "$NOTIFICATION_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "Personal Finance Hub Backup - $status" "$NOTIFICATION_EMAIL"
    fi
}

# Restore from backup
restore_backup() {
    local backup_file=$1

    if [ -z "$backup_file" ]; then
        print_error "Usage: $0 restore <backup_file.tar.gz>"
        exit 1
    fi

    if [ ! -f "$backup_file" ]; then
        print_error "Backup file not found: $backup_file"
        exit 1
    fi

    print_warning "This will RESTORE data from backup and OVERWRITE current data!"
    print_warning "Make sure to stop all services before proceeding."
    echo

    if [ -t 0 ]; then
        read -p "Are you sure you want to restore from $backup_file? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Restore operation cancelled."
            exit 0
        fi
    fi

    # Extract backup
    local restore_dir="/tmp/pfh_restore_$"
    mkdir -p "$restore_dir"

    print_status "Extracting backup..."
    tar -xzf "$backup_file" -C "$restore_dir"

    local extracted_dir=$(find "$restore_dir" -maxdepth 1 -name "pfh_backup_*" -type d | head -1)

    if [ -z "$extracted_dir" ]; then
        print_error "Invalid backup archive structure"
        rm -rf "$restore_dir"
        exit 1
    fi

    # Restore PostgreSQL
    if [ -f "$extracted_dir/postgresql_backup.sql" ]; then
        print_status "Restoring PostgreSQL database..."
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
        PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER < "$extracted_dir/postgresql_backup.sql"
        print_success "PostgreSQL restore completed"
    fi

    # Restore MongoDB
    if [ -d "$extracted_dir/mongodb/$MONGODB_DB" ]; then
        print_status "Restoring MongoDB database..."
        docker exec pfh-mongo-primary mongosh --eval "db.getSiblingDB('$MONGODB_DB').dropDatabase()"
        docker cp "$extracted_dir/mongodb/$MONGODB_DB" pfh-mongo-primary:/tmp/
        docker exec pfh-mongo-primary mongorestore --host localhost:27017 --username $MONGODB_USER --password $MONGODB_PASSWORD --authenticationDatabase admin --db $MONGODB_DB /tmp/$MONGODB_DB/
        docker exec pfh-mongo-primary rm -rf /tmp/$MONGODB_DB
        print_success "MongoDB restore completed"
    fi

    # Restore Redis
    if [ -f "$extracted_dir/redis_backup.rdb" ]; then
        print_status "Restoring Redis data..."
        docker stop pfh-redis-master || true
        docker cp "$extracted_dir/redis_backup.rdb" pfh-redis-master:/data/dump.rdb
        docker start pfh-redis-master
        print_success "Redis restore completed"
    fi

    # Restore MinIO
    if [ -d "$extracted_dir/minio/data" ]; then
        print_status "Restoring MinIO data..."
        docker stop pfh-minio || true
        docker cp "$extracted_dir/minio/data/." pfh-minio:/data/
        docker start pfh-minio
        print_success "MinIO restore completed"
    fi

    # Cleanup
    rm -rf "$restore_dir"

    print_success "🎉 Restore completed successfully!"
    print_status "Please restart all services: docker-compose restart"
}

# List available backups
list_backups() {
    print_status "Available backups:"
    echo

    if [ ! -d "$BACKUP_DIR" ]; then
        print_warning "No backup directory found"
        return
    fi

    local backup_files=($(find "$BACKUP_DIR" -name "pfh_backup_*.tar.gz" -type f | sort -r))

    if [ ${#backup_files[@]} -eq 0 ]; then
        print_warning "No backups found"
        return
    fi

    printf "%-5s %-20s %-15s %-10s\n" "#" "NAME" "DATE" "SIZE"
    printf "%-5s %-20s %-15s %-10s\n" "---" "----" "----" "----"

    local index=1
    for backup in "${backup_files[@]}"; do
        local basename=$(basename "$backup")
        local date_part=$(echo "$basename" | grep -o '[0-9]\{8\}_[0-9]\{6\}')
        local formatted_date=$(echo "$date_part" | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)_\([0-9]\{2\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\1-\2-\3 \4:\5:\6/')
        local size=$(du -h "$backup" | cut -f1)

        printf "%-5s %-20s %-15s %-10s\n" "$index" "$basename" "$formatted_date" "$size"
        index=$((index + 1))
    done
}

# Check system health before backup
health_check() {
    print_status "Performing system health check..."

    local errors=0

    # Check Docker services
    local services=("pfh-postgres-master" "pfh-mongo-primary" "pfh-redis-master")
    for service in "${services[@]}"; do
        if ! docker ps --format "table {{.Names}}" | grep -q "^$service$"; then
            print_warning "Service $service is not running"
            errors=$((errors + 1))
        fi
    done

    # Check database connectivity
    if ! PGPASSWORD=$POSTGRES_PASSWORD pg_isready -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB >/dev/null 2>&1; then
        print_warning "PostgreSQL is not accessible"
        errors=$((errors + 1))
    fi

    if ! docker exec pfh-mongo-primary mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        print_warning "MongoDB is not accessible"
        errors=$((errors + 1))
    fi

    if ! docker exec pfh-redis-master redis-cli ping >/dev/null 2>&1; then
        print_warning "Redis is not accessible"
        errors=$((errors + 1))
    fi

    # Check disk space
    local available_space=$(df "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    local required_space=1048576  # 1GB in KB

    if [ "$available_space" -lt "$required_space" ]; then
        print_warning "Low disk space available for backup"
        errors=$((errors + 1))
    fi

    if [ $errors -eq 0 ]; then
        print_success "System health check passed"
        return 0
    else
        print_warning "System health check found $errors issues"
        return 1
    fi
}

# Main backup function
backup_full() {
    local start_time=$(date +%s)

    print_status "Starting full backup process..."

    # Health check
    if ! health_check; then
        if [ -t 0 ]; then
            read -p "Continue with backup despite health check warnings? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_status "Backup cancelled by user."
                exit 1
            fi
        else
            print_warning "Proceeding with backup despite warnings..."
        fi
    fi

    create_backup_dir

    # Perform backups
    backup_postgresql
    backup_postgresql_schema
    backup_mongodb
    backup_redis
    backup_config
    backup_minio
    create_manifest

    compress_backup
    verify_backup
    upload_to_cloud
    cleanup_old_backups

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local archive_path="$BACKUP_DIR/$BACKUP_NAME.tar.gz"
    local final_size=$(du -h "$archive_path" | cut -f1)

    local success_message="✅ Full backup completed successfully!
📦 Archive: $BACKUP_NAME.tar.gz
📏 Size: $final_size
⏱️ Duration: ${duration}s
📍 Location: $archive_path"

    print_success "$success_message"
    send_notification "success" "$success_message"
}

# Show usage information
show_usage() {
    cat << EOF
Personal Finance Hub - Backup Script
Pateta o DEV - Complete Data Backup System

Usage: $0 [COMMAND] [OPTIONS]

Commands:
  backup, full        Perform full backup (default)
  restore <file>      Restore from backup archive
  list, ls           List available backups
  health-check       Check system health
  help              Show this help message

Options:
  --no-compress      Skip compression step
  --no-upload        Skip cloud upload
  --no-cleanup       Skip cleanup of old backups
  --retention-days   Set backup retention period (default: 30)

Environment Variables:
  BACKUP_RETENTION_DAYS      Backup retention in days (default: 30)
  BACKUP_UPLOAD_ENABLED      Enable cloud upload (true/false)
  AWS_S3_BACKUP_BUCKET       S3 bucket for backups
  GCS_BACKUP_BUCKET          Google Cloud Storage bucket
  BACKUP_REMOTE_HOST         Remote host for SCP upload
  BACKUP_REMOTE_PATH         Remote path for SCP upload
  NOTIFICATION_WEBHOOK_URL   Webhook URL for notifications
  NOTIFICATION_EMAIL         Email for notifications

Examples:
  $0                         # Perform full backup
  $0 backup                  # Same as above
  $0 restore backup.tar.gz   # Restore from backup
  $0 list                    # List available backups
  $0 health-check            # Check system health

EOF
}

# Main function
main() {
    local command=${1:-backup}
    shift || true

    case "$command" in
        backup|full)
            backup_full "$@"
            ;;
        restore)
            restore_backup "$1"
            ;;
        list|ls)
            list_backups
            ;;
        health-check)
            health_check
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

# Trap errors and cleanup
trap 'print_error "Backup script interrupted!"; exit 1' INT TERM

# Check if running directly or being sourced
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    echo "=============================================="
    echo "💾 Personal Finance Hub - Backup System"
    echo "   Pateta o DEV - Data Protection & Recovery"
    echo "=============================================="
    echo

    main "$@"
fi