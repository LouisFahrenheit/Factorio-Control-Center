import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a controller or endpoint as publicly accessible,
 * bypassing authentication checks in AuthGuard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
