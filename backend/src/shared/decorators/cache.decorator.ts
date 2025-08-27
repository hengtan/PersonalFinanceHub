// Cache decorator for method results
export function Cache(options?: {
  ttl?: number; // Time to live in seconds
  key?: string; // Custom cache key
  namespace?: string; // Cache namespace
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const ttl = options?.ttl || 300; // 5 minutes default
    const namespace = options?.namespace || 'default';

    descriptor.value = async function (...args: any[]) {
      const cacheKey = options?.key || `${namespace}:${propertyName}:${JSON.stringify(args)}`;
      
      // Try to get from cache first
      // Note: This will need to be integrated with actual cache service
      const cachedResult = await getCachedValue(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Execute the original method
      const result = await method.apply(this, args);
      
      // Store result in cache
      await setCachedValue(cacheKey, result, ttl);
      
      return result;
    };

    return descriptor;
  };
}

// Cache invalidation decorator
export function CacheEvict(options?: {
  key?: string;
  namespace?: string;
  allEntries?: boolean;
}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const namespace = options?.namespace || 'default';

    descriptor.value = async function (...args: any[]) {
      // Execute the original method first
      const result = await method.apply(this, args);
      
      if (options?.allEntries) {
        // Clear all cache entries for namespace
        await clearNamespaceCache(namespace);
      } else {
        // Clear specific cache entry
        const cacheKey = options?.key || `${namespace}:${propertyName}:${JSON.stringify(args)}`;
        await deleteCacheKey(cacheKey);
      }
      
      return result;
    };

    return descriptor;
  };
}

import { CacheService } from '../../infrastructure/cache/cache.service';

const cacheService = CacheService.getInstance();

async function getCachedValue(key: string): Promise<any> {
  return await cacheService.get(key);
}

async function setCachedValue(key: string, value: any, ttl: number): Promise<void> {
  await cacheService.set(key, value, ttl);
}

async function deleteCacheKey(key: string): Promise<void> {
  await cacheService.del(key);
}

async function clearNamespaceCache(namespace: string): Promise<void> {
  await cacheService.clearNamespace(namespace);
}