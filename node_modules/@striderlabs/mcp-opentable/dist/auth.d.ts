/**
 * OpenTable Authentication & Session Management
 *
 * Handles cookie persistence and login state detection.
 */
import type { BrowserContext } from "playwright";
export interface AuthState {
    isLoggedIn: boolean;
    email?: string;
    firstName?: string;
    lastName?: string;
}
/**
 * Save cookies from browser context to disk
 */
export declare function saveCookies(context: BrowserContext): Promise<void>;
/**
 * Load cookies from disk and add to browser context
 */
export declare function loadCookies(context: BrowserContext): Promise<boolean>;
/**
 * Clear stored cookies
 */
export declare function clearCookies(): void;
/**
 * Check if we have stored cookies
 */
export declare function hasStoredCookies(): boolean;
/**
 * Extract auth state from OpenTable page cookies
 */
export declare function getAuthState(context: BrowserContext): Promise<AuthState>;
/**
 * Get the path where cookies are stored
 */
export declare function getCookiesPath(): string;
