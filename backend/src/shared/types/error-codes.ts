// backend/src/shared/constants/error-codes.ts

/**
 * Códigos de erro padronizados do sistema
 * Seguem a convenção HTTP + códigos específicos do domínio
 */
export const ERROR_CODES = {
    // Authentication & Authorization (1000-1099)
    MISSING_TOKEN: 'AUTH_1001',
    INVALID_TOKEN: 'AUTH_1002',
    TOKEN_EXPIRED: 'AUTH_1003',
    TOKEN_REVOKED: 'AUTH_1004',
    FORBIDDEN: 'AUTH_1005',
    NOT_AUTHENTICATED: 'AUTH_1006',
    INVALID_REFRESH_TOKEN: 'AUTH_1007',
    SESSION_EXPIRED: 'AUTH_1008',
    ACCOUNT_SUSPENDED: 'AUTH_1009',
    ACCOUNT_DELETED: 'AUTH_1010',
    MFA_REQUIRED: 'AUTH_1011',
    MFA_INVALID: 'AUTH_1012',

    // Validation (1100-1199)
    VALIDATION_ERROR: 'VAL_1101',
    MISSING_REQUIRED_FIELD: 'VAL_1102',
    INVALID_FORMAT: 'VAL_1103',
    INVALID_ENUM_VALUE: 'VAL_1104',
    VALUE_TOO_LONG: 'VAL_1105',
    VALUE_TOO_SHORT: 'VAL_1106',
    INVALID_UUID: 'VAL_1107',
    INVALID_EMAIL: 'VAL_1108',
    INVALID_DATE: 'VAL_1109',
    INVALID_CURRENCY: 'VAL_1110',
    INVALID_AMOUNT: 'VAL_1111',

    // User Management (1200-1299)
    USER_EXISTS: 'USER_1201',
    USER_NOT_FOUND: 'USER_1202',
    INVALID_CREDENTIALS: 'USER_1203',
    ACCOUNT_LOCKED: 'USER_1204',
    ACCOUNT_INACTIVE: 'USER_1205',
    EMAIL_NOT_VERIFIED: 'USER_1206',
    WEAK_PASSWORD: 'USER_1207',
    PASSWORD_REUSED: 'USER_1208',
    PROFILE_INCOMPLETE: 'USER_1209',
    SUBSCRIPTION_REQUIRED: 'USER_1210',
    SUBSCRIPTION_EXPIRED: 'USER_1211',

    // Transaction Errors (1300-1399)
    TRANSACTION_NOT_FOUND: 'TXN_1301',
    INSUFFICIENT_BALANCE: 'TXN_1302',
    TRANSFER_ACCOUNT_NOT_FOUND: 'TXN_1304',
    MERCHANT_NOT_FOUND: 'TXN_1306',
    INVALID_TRANSACTION_TYPE: 'TXN_1307',
    TRANSACTION_ALREADY_PROCESSED: 'TXN_1308',
    TRANSACTION_CANCELLED: 'TXN_1309',
    DUPLICATE_TRANSACTION: 'TXN_1310',
    TRANSACTION_LIMIT_EXCEEDED: 'TXN_1311',
    INVALID_TRANSFER_ACCOUNTS: 'TXN_1312',
    TRANSACTION_DATE_INVALID: 'TXN_1313',

    // Budget Errors (1400-1499)
    BUDGET_NOT_FOUND: 'BDG_1401',
    BUDGET_ALREADY_EXISTS: 'BDG_1402',
    BUDGET_PERIOD_INVALID: 'BDG_1403',
    BUDGET_CATEGORY_NOT_FOUND: 'BDG_1404',
    BUDGET_AMOUNT_EXCEEDED: 'BDG_1405',
    BUDGET_CATEGORY_EXISTS: 'BDG_1406',
    BUDGET_LOCKED: 'BDG_1407',
    BUDGET_PERCENTAGE_INVALID: 'BDG_1408',
    BUDGET_TOTAL_MISMATCH: 'BDG_1409',
    SAVINGS_GOAL_NOT_FOUND: 'BDG_1410',
    SAVINGS_GOAL_EXCEEDED: 'BDG_1411',

    // Account Errors (1500-1599)
    ACCOUNT_NOT_FOUND: 'ACC_1501',
    ACCOUNT_ALREADY_EXISTS: 'ACC_1502',
    ACCOUNT_TYPE_INVALID: 'ACC_1503',
    ACCOUNT_CLOSED: 'ACC_1504',
    ACCOUNT_FROZEN: 'ACC_1505',
    ACCOUNT_LIMIT_EXCEEDED: 'ACC_1506',
    ACCOUNT_CURRENCY_MISMATCH: 'ACC_1507',
    ACCOUNT_BALANCE_INVALID: 'ACC_1508',
    LINKED_ACCOUNT_ERROR: 'ACC_1509',
    ACCOUNT_VERIFICATION_FAILED: 'ACC_1510',

    // Category & Tag Errors (1600-1699)
    CATEGORY_NOT_FOUND: 'CAT_1601',
    CATEGORY_ALREADY_EXISTS: 'CAT_1602',
    CATEGORY_HAS_TRANSACTIONS: 'CAT_1603',
    CATEGORY_LIMIT_EXCEEDED: 'CAT_1604',
    TAG_NOT_FOUND: 'TAG_1605',
    TAG_ALREADY_EXISTS: 'TAG_1606',
    TAG_LIMIT_EXCEEDED: 'TAG_1607',
    INVALID_CATEGORY_HIERARCHY: 'CAT_1608',

    // Import/Export Errors (1700-1799)
    IMPORT_FILE_INVALID: 'IMP_1701',
    IMPORT_FORMAT_UNSUPPORTED: 'IMP_1702',
    IMPORT_DATA_CORRUPTED: 'IMP_1703',
    IMPORT_MAPPING_INVALID: 'IMP_1704',
    EXPORT_FAILED: 'EXP_1705',
    FILE_SIZE_EXCEEDED: 'FILE_1706',
    FILE_TYPE_INVALID: 'FILE_1707',
    PARSING_ERROR: 'PARSE_1708',
    DUPLICATE_IMPORT: 'IMP_1709',

    // Database Errors (1800-1899)
    DATABASE_ERROR: 'DB_1801',
    CONNECTION_FAILED: 'DB_1802',
    QUERY_TIMEOUT: 'DB_1803',
    TRANSACTION_FAILED: 'DB_1804',
    CONSTRAINT_VIOLATION: 'DB_1805',
    DATA_INTEGRITY_ERROR: 'DB_1806',
    MIGRATION_FAILED: 'DB_1807',
    BACKUP_FAILED: 'DB_1808',
    RESTORE_FAILED: 'DB_1809',

    // External Service Errors (1900-1999)
    EXTERNAL_SERVICE_ERROR: 'EXT_1901',
    BANK_CONNECTION_FAILED: 'EXT_1902',
    PAYMENT_PROCESSOR_ERROR: 'EXT_1903',
    EMAIL_SERVICE_ERROR: 'EXT_1904',
    SMS_SERVICE_ERROR: 'EXT_1905',
    NOTIFICATION_ERROR: 'EXT_1906',
    CURRENCY_SERVICE_ERROR: 'EXT_1907',
    BANK_SYNC_FAILED: 'EXT_1908',
    API_RATE_LIMITED: 'EXT_1909',
    THIRD_PARTY_TIMEOUT: 'EXT_1910',

    // System Errors (2000-2099)
    INTERNAL_SERVER_ERROR: 'SYS_2001',
    SERVICE_UNAVAILABLE: 'SYS_2002',
    MAINTENANCE_MODE: 'SYS_2003',
    RATE_LIMIT_EXCEEDED: 'SYS_2004',
    RESOURCE_NOT_FOUND: 'SYS_2005',
    METHOD_NOT_ALLOWED: 'SYS_2006',
    UNSUPPORTED_MEDIA_TYPE: 'SYS_2007',
    PAYLOAD_TOO_LARGE: 'SYS_2008',
    TOO_MANY_REQUESTS: 'SYS_2009',
    CACHE_ERROR: 'SYS_2010',
    QUEUE_ERROR: 'SYS_2011',
    FEATURE_NOT_AVAILABLE: 'SYS_2012',

    // Business Logic Errors (2100-2199)
    BUSINESS_RULE_VIOLATION: 'BIZ_2101',
    INSUFFICIENT_PERMISSIONS: 'BIZ_2102',
    OPERATION_NOT_ALLOWED: 'BIZ_2103',
    RESOURCE_LOCKED: 'BIZ_2104',
    CONCURRENT_MODIFICATION: 'BIZ_2105',
    WORKFLOW_VIOLATION: 'BIZ_2106',
    QUOTA_EXCEEDED: 'BIZ_2107',
    LIMIT_REACHED: 'BIZ_2108',
    DEPENDENCY_ERROR: 'BIZ_2109',
    STATE_CONFLICT: 'BIZ_2110',

    // Security Errors (2200-2299)
    SECURITY_VIOLATION: 'SEC_2201',
    SUSPICIOUS_ACTIVITY: 'SEC_2202',
    IP_BLOCKED: 'SEC_2203',
    DEVICE_NOT_RECOGNIZED: 'SEC_2204',
    ENCRYPTION_ERROR: 'SEC_2205',
    SIGNATURE_INVALID: 'SEC_2206',
    CSRF_TOKEN_INVALID: 'SEC_2207',
    REQUEST_TAMPERED: 'SEC_2208',
    GEOLOCATION_BLOCKED: 'SEC_2209',
    BRUTE_FORCE_DETECTED: 'SEC_2210',
} as const;

/**
 * Mensagens de erro em português para o usuário final
 */
export const ERROR_MESSAGES = {
    // Authentication & Authorization
    [ERROR_CODES.MISSING_TOKEN]: 'Token de autenticação é obrigatório',
    [ERROR_CODES.INVALID_TOKEN]: 'Token de autenticação inválido',
    [ERROR_CODES.TOKEN_EXPIRED]: 'Token de autenticação expirou',
    [ERROR_CODES.TOKEN_REVOKED]: 'Token de autenticação foi revogado',
    [ERROR_CODES.FORBIDDEN]: 'Acesso negado. Permissões insuficientes',
    [ERROR_CODES.NOT_AUTHENTICATED]: 'Autenticação é necessária para acessar este recurso',
    [ERROR_CODES.INVALID_REFRESH_TOKEN]: 'Token de renovação inválido',
    [ERROR_CODES.SESSION_EXPIRED]: 'Sessão expirou. Faça login novamente',
    [ERROR_CODES.ACCOUNT_SUSPENDED]: 'Conta foi suspensa',
    [ERROR_CODES.ACCOUNT_DELETED]: 'Conta foi excluída',
    [ERROR_CODES.MFA_REQUIRED]: 'Autenticação de dois fatores é obrigatória',
    [ERROR_CODES.MFA_INVALID]: 'Código de autenticação inválido',

    // Validation
    [ERROR_CODES.VALIDATION_ERROR]: 'Erro de validação dos dados',
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Campo obrigatório não foi informado',
    [ERROR_CODES.INVALID_FORMAT]: 'Formato dos dados inválido',
    [ERROR_CODES.INVALID_ENUM_VALUE]: 'Valor inválido para o campo',
    [ERROR_CODES.VALUE_TOO_LONG]: 'Valor muito longo',
    [ERROR_CODES.VALUE_TOO_SHORT]: 'Valor muito curto',
    [ERROR_CODES.INVALID_UUID]: 'Identificador inválido',
    [ERROR_CODES.INVALID_EMAIL]: 'Email inválido',
    [ERROR_CODES.INVALID_DATE]: 'Data inválida',
    [ERROR_CODES.INVALID_CURRENCY]: 'Moeda inválida',
    [ERROR_CODES.INVALID_AMOUNT]: 'Valor monetário inválido',

    // User Management
    [ERROR_CODES.USER_EXISTS]: 'Já existe um usuário com este email',
    [ERROR_CODES.USER_NOT_FOUND]: 'Usuário não encontrado',
    [ERROR_CODES.INVALID_CREDENTIALS]: 'Email ou senha inválidos',
    [ERROR_CODES.ACCOUNT_LOCKED]: 'Conta está temporariamente bloqueada',
    [ERROR_CODES.ACCOUNT_INACTIVE]: 'Conta não está ativa',
    [ERROR_CODES.EMAIL_NOT_VERIFIED]: 'Email não foi verificado',
    [ERROR_CODES.WEAK_PASSWORD]: 'Senha muito fraca',
    [ERROR_CODES.PASSWORD_REUSED]: 'Senha já foi utilizada anteriormente',
    [ERROR_CODES.PROFILE_INCOMPLETE]: 'Perfil incompleto',
    [ERROR_CODES.SUBSCRIPTION_REQUIRED]: 'Assinatura premium é necessária',
    [ERROR_CODES.SUBSCRIPTION_EXPIRED]: 'Assinatura expirou',

    // Transaction Errors
    [ERROR_CODES.TRANSACTION_NOT_FOUND]: 'Transação não encontrada',
    [ERROR_CODES.INSUFFICIENT_BALANCE]: 'Saldo insuficiente na conta',
    [ERROR_CODES.ACCOUNT_NOT_FOUND]: 'Conta não encontrada',
    [ERROR_CODES.TRANSFER_ACCOUNT_NOT_FOUND]: 'Conta de destino não encontrada',
    [ERROR_CODES.CATEGORY_NOT_FOUND]: 'Categoria não encontrada',
    [ERROR_CODES.MERCHANT_NOT_FOUND]: 'Estabelecimento não encontrado',
    [ERROR_CODES.INVALID_TRANSACTION_TYPE]: 'Tipo de transação inválido',
    [ERROR_CODES.TRANSACTION_ALREADY_PROCESSED]: 'Transação já foi processada',
    [ERROR_CODES.TRANSACTION_CANCELLED]: 'Transação foi cancelada',
    [ERROR_CODES.DUPLICATE_TRANSACTION]: 'Transação duplicada',
    [ERROR_CODES.TRANSACTION_LIMIT_EXCEEDED]: 'Limite de transação excedido',
    [ERROR_CODES.INVALID_TRANSFER_ACCOUNTS]: 'Contas de origem e destino devem ser diferentes',
    [ERROR_CODES.TRANSACTION_DATE_INVALID]: 'Data da transação inválida',

    // Budget Errors
    [ERROR_CODES.BUDGET_NOT_FOUND]: 'Orçamento não encontrado',
    [ERROR_CODES.BUDGET_ALREADY_EXISTS]: 'Orçamento já existe para este período',
    [ERROR_CODES.BUDGET_PERIOD_INVALID]: 'Período do orçamento inválido',
    [ERROR_CODES.BUDGET_CATEGORY_NOT_FOUND]: 'Categoria do orçamento não encontrada',
    [ERROR_CODES.BUDGET_AMOUNT_EXCEEDED]: 'Valor orçado foi excedido',
    [ERROR_CODES.BUDGET_CATEGORY_EXISTS]: 'Categoria já existe no orçamento',
    [ERROR_CODES.BUDGET_LOCKED]: 'Orçamento está bloqueado para alterações',
    [ERROR_CODES.BUDGET_PERCENTAGE_INVALID]: 'Porcentagem do orçamento inválida',
    [ERROR_CODES.BUDGET_TOTAL_MISMATCH]: 'Total do orçamento não confere',
    [ERROR_CODES.SAVINGS_GOAL_NOT_FOUND]: 'Meta de poupança não encontrada',
    [ERROR_CODES.SAVINGS_GOAL_EXCEEDED]: 'Meta de poupança foi excedida',

    // Account Errors
    [ERROR_CODES.ACCOUNT_NOT_FOUND]: 'Conta não encontrada',
    [ERROR_CODES.ACCOUNT_ALREADY_EXISTS]: 'Conta já existe',
    [ERROR_CODES.ACCOUNT_TYPE_INVALID]: 'Tipo de conta inválido',
    [ERROR_CODES.ACCOUNT_CLOSED]: 'Conta está fechada',
    [ERROR_CODES.ACCOUNT_FROZEN]: 'Conta está congelada',
    [ERROR_CODES.ACCOUNT_LIMIT_EXCEEDED]: 'Limite de contas excedido',
    [ERROR_CODES.ACCOUNT_CURRENCY_MISMATCH]: 'Moeda da conta não confere',
    [ERROR_CODES.ACCOUNT_BALANCE_INVALID]: 'Saldo da conta inválido',
    [ERROR_CODES.LINKED_ACCOUNT_ERROR]: 'Erro na conta vinculada',
    [ERROR_CODES.ACCOUNT_VERIFICATION_FAILED]: 'Verificação da conta falhou',

    // Category & Tag Errors
    [ERROR_CODES.CATEGORY_NOT_FOUND]: 'Categoria não encontrada',
    [ERROR_CODES.CATEGORY_ALREADY_EXISTS]: 'Categoria já existe',
    [ERROR_CODES.CATEGORY_HAS_TRANSACTIONS]: 'Categoria possui transações vinculadas',
    [ERROR_CODES.CATEGORY_LIMIT_EXCEEDED]: 'Limite de categorias excedido',
    [ERROR_CODES.TAG_NOT_FOUND]: 'Tag não encontrada',
    [ERROR_CODES.TAG_ALREADY_EXISTS]: 'Tag já existe',
    [ERROR_CODES.TAG_LIMIT_EXCEEDED]: 'Limite de tags excedido',
    [ERROR_CODES.INVALID_CATEGORY_HIERARCHY]: 'Hierarquia de categoria inválida',

    // Import/Export Errors
    [ERROR_CODES.IMPORT_FILE_INVALID]: 'Arquivo de importação inválido',
    [ERROR_CODES.IMPORT_FORMAT_UNSUPPORTED]: 'Formato de importação não suportado',
    [ERROR_CODES.IMPORT_DATA_CORRUPTED]: 'Dados de importação corrompidos',
    [ERROR_CODES.IMPORT_MAPPING_INVALID]: 'Mapeamento de importação inválido',
    [ERROR_CODES.EXPORT_FAILED]: 'Falha na exportação',
    [ERROR_CODES.FILE_SIZE_EXCEEDED]: 'Tamanho do arquivo excedido',
    [ERROR_CODES.FILE_TYPE_INVALID]: 'Tipo de arquivo inválido',
    [ERROR_CODES.PARSING_ERROR]: 'Erro ao processar arquivo',
    [ERROR_CODES.DUPLICATE_IMPORT]: 'Importação duplicada',

    // Database Errors
    [ERROR_CODES.DATABASE_ERROR]: 'Erro no banco de dados',
    [ERROR_CODES.CONNECTION_FAILED]: 'Falha na conexão com o banco',
    [ERROR_CODES.QUERY_TIMEOUT]: 'Timeout na consulta',
    [ERROR_CODES.TRANSACTION_FAILED]: 'Transação do banco falhou',
    [ERROR_CODES.CONSTRAINT_VIOLATION]: 'Violação de integridade',
    [ERROR_CODES.DATA_INTEGRITY_ERROR]: 'Erro de integridade dos dados',
    [ERROR_CODES.MIGRATION_FAILED]: 'Falha na migração',
    [ERROR_CODES.BACKUP_FAILED]: 'Falha no backup',
    [ERROR_CODES.RESTORE_FAILED]: 'Falha na restauração',

    // External Service Errors
    [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 'Erro em serviço externo',
    [ERROR_CODES.BANK_CONNECTION_FAILED]: 'Falha na conexão bancária',
    [ERROR_CODES.PAYMENT_PROCESSOR_ERROR]: 'Erro no processador de pagamento',
    [ERROR_CODES.EMAIL_SERVICE_ERROR]: 'Erro no serviço de email',
    [ERROR_CODES.SMS_SERVICE_ERROR]: 'Erro no serviço de SMS',
    [ERROR_CODES.NOTIFICATION_ERROR]: 'Erro no serviço de notificação',
    [ERROR_CODES.CURRENCY_SERVICE_ERROR]: 'Erro no serviço de cotação',
    [ERROR_CODES.BANK_SYNC_FAILED]: 'Falha na sincronização bancária',
    [ERROR_CODES.API_RATE_LIMITED]: 'Limite de requisições da API excedido',
    [ERROR_CODES.THIRD_PARTY_TIMEOUT]: 'Timeout em serviço terceirizado',

    // System Errors
    [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'Erro interno do servidor',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Serviço temporariamente indisponível',
    [ERROR_CODES.MAINTENANCE_MODE]: 'Sistema em manutenção',
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Muitas requisições. Tente novamente mais tarde',
    [ERROR_CODES.RESOURCE_NOT_FOUND]: 'Recurso não encontrado',
    [ERROR_CODES.METHOD_NOT_ALLOWED]: 'Método não permitido',
    [ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: 'Tipo de mídia não suportado',
    [ERROR_CODES.PAYLOAD_TOO_LARGE]: 'Payload muito grande',
    [ERROR_CODES.TOO_MANY_REQUESTS]: 'Muitas requisições simultâneas',
    [ERROR_CODES.CACHE_ERROR]: 'Erro no cache',
    [ERROR_CODES.QUEUE_ERROR]: 'Erro na fila de processamento',
    [ERROR_CODES.FEATURE_NOT_AVAILABLE]: 'Funcionalidade não disponível',

    // Business Logic Errors
    [ERROR_CODES.BUSINESS_RULE_VIOLATION]: 'Violação de regra de negócio',
    [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'Permissões insuficientes',
    [ERROR_CODES.OPERATION_NOT_ALLOWED]: 'Operação não permitida',
    [ERROR_CODES.RESOURCE_LOCKED]: 'Recurso está bloqueado',
    [ERROR_CODES.CONCURRENT_MODIFICATION]: 'Modificação concorrente detectada',
    [ERROR_CODES.WORKFLOW_VIOLATION]: 'Violação do fluxo de trabalho',
    [ERROR_CODES.QUOTA_EXCEEDED]: 'Cota excedida',
    [ERROR_CODES.LIMIT_REACHED]: 'Limite atingido',
    [ERROR_CODES.DEPENDENCY_ERROR]: 'Erro de dependência',
    [ERROR_CODES.STATE_CONFLICT]: 'Conflito de estado',

    // Security Errors
    [ERROR_CODES.SECURITY_VIOLATION]: 'Violação de segurança',
    [ERROR_CODES.SUSPICIOUS_ACTIVITY]: 'Atividade suspeita detectada',
    [ERROR_CODES.IP_BLOCKED]: 'IP bloqueado',
    [ERROR_CODES.DEVICE_NOT_RECOGNIZED]: 'Dispositivo não reconhecido',
    [ERROR_CODES.ENCRYPTION_ERROR]: 'Erro de criptografia',
    [ERROR_CODES.SIGNATURE_INVALID]: 'Assinatura inválida',
    [ERROR_CODES.CSRF_TOKEN_INVALID]: 'Token CSRF inválido',
    [ERROR_CODES.REQUEST_TAMPERED]: 'Requisição foi alterada',
    [ERROR_CODES.GEOLOCATION_BLOCKED]: 'Localização bloqueada',
    [ERROR_CODES.BRUTE_FORCE_DETECTED]: 'Tentativa de força bruta detectada',
} as const;

/**
 * Mapeia códigos de erro para códigos HTTP apropriados
 */
export const HTTP_STATUS_MAP: Record<string, number> = {
    // 400 - Bad Request
    [ERROR_CODES.VALIDATION_ERROR]: 400,
    [ERROR_CODES.MISSING_REQUIRED_FIELD]: 400,
    [ERROR_CODES.INVALID_FORMAT]: 400,
    [ERROR_CODES.INSUFFICIENT_BALANCE]: 400,
    [ERROR_CODES.INVALID_TRANSACTION_TYPE]: 400,
    [ERROR_CODES.BUDGET_PERIOD_INVALID]: 400,
    [ERROR_CODES.BUSINESS_RULE_VIOLATION]: 400,

    // 401 - Unauthorized
    [ERROR_CODES.MISSING_TOKEN]: 401,
    [ERROR_CODES.INVALID_TOKEN]: 401,
    [ERROR_CODES.TOKEN_EXPIRED]: 401,
    [ERROR_CODES.NOT_AUTHENTICATED]: 401,
    [ERROR_CODES.INVALID_CREDENTIALS]: 401,

    // 403 - Forbidden
    [ERROR_CODES.FORBIDDEN]: 403,
    [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 403,
    [ERROR_CODES.ACCOUNT_SUSPENDED]: 403,
    [ERROR_CODES.OPERATION_NOT_ALLOWED]: 403,

    // 404 - Not Found
    [ERROR_CODES.TRANSACTION_NOT_FOUND]: 404,
    [ERROR_CODES.USER_NOT_FOUND]: 404,
    [ERROR_CODES.ACCOUNT_NOT_FOUND]: 404,
    [ERROR_CODES.BUDGET_NOT_FOUND]: 404,
    [ERROR_CODES.CATEGORY_NOT_FOUND]: 404,
    [ERROR_CODES.RESOURCE_NOT_FOUND]: 404,

    // 409 - Conflict
    [ERROR_CODES.USER_EXISTS]: 409,
    [ERROR_CODES.BUDGET_ALREADY_EXISTS]: 409,
    [ERROR_CODES.DUPLICATE_TRANSACTION]: 409,
    [ERROR_CODES.CONCURRENT_MODIFICATION]: 409,

    // 423 - Locked
    [ERROR_CODES.ACCOUNT_LOCKED]: 423,
    [ERROR_CODES.RESOURCE_LOCKED]: 423,
    [ERROR_CODES.BUDGET_LOCKED]: 423,

    // 429 - Too Many Requests
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
    [ERROR_CODES.TOO_MANY_REQUESTS]: 429,
    [ERROR_CODES.BRUTE_FORCE_DETECTED]: 429,

    // 500 - Internal Server Error
    [ERROR_CODES.INTERNAL_SERVER_ERROR]: 500,
    [ERROR_CODES.DATABASE_ERROR]: 500,
    [ERROR_CODES.CACHE_ERROR]: 500,

    // 503 - Service Unavailable
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
    [ERROR_CODES.MAINTENANCE_MODE]: 503,
    [ERROR_CODES.EXTERNAL_SERVICE_ERROR]: 503,
};

/**
 * Utilitário para obter informações completas do erro
 */
export class ErrorInfo {
    static getErrorInfo(errorCode: keyof typeof ERROR_CODES) {
        return {
            code: ERROR_CODES[errorCode],
            message: ERROR_MESSAGES[ERROR_CODES[errorCode]],
            httpStatus: HTTP_STATUS_MAP[ERROR_CODES[errorCode]] || 500,
        };
    }

    static isClientError(errorCode: string): boolean {
        const httpStatus = HTTP_STATUS_MAP[errorCode] || 500;
        return httpStatus >= 400 && httpStatus < 500;
    }

    static isServerError(errorCode: string): boolean {
        const httpStatus = HTTP_STATUS_MAP[errorCode] || 500;
        return httpStatus >= 500;
    }
}

// Type exports
export type ErrorCode = keyof typeof ERROR_CODES;
export type ErrorMessage = typeof ERROR_MESSAGES[keyof typeof ERROR_MESSAGES];