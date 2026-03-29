/**
 * OpenTable Browser Automation
 *
 * Playwright-based automation for OpenTable reservation operations.
 */
import { AuthState } from "./auth.js";
export interface Restaurant {
    id: string;
    name: string;
    cuisine: string;
    location: string;
    neighborhood?: string;
    rating?: number;
    reviewCount?: number;
    priceRange?: string;
    imageUrl?: string;
    profileUrl?: string;
}
export interface RestaurantDetails extends Restaurant {
    description?: string;
    address?: string;
    phone?: string;
    hours?: string;
    website?: string;
    features?: string[];
}
export interface AvailabilitySlot {
    time: string;
    partySize: number;
    date: string;
    reservationToken?: string;
}
export interface Reservation {
    id: string;
    restaurantName: string;
    date: string;
    time: string;
    partySize: number;
    status: string;
    confirmationNumber?: string;
    specialRequests?: string;
}
/**
 * Check if user is logged in to OpenTable
 */
export declare function checkAuth(): Promise<AuthState>;
/**
 * Return login URL and instructions for the user to authenticate
 */
export declare function getLoginUrl(): Promise<{
    url: string;
    instructions: string;
}>;
/**
 * Search restaurants on OpenTable
 */
export declare function searchRestaurants(params: {
    location: string;
    cuisine?: string;
    partySize?: number;
    date?: string;
    time?: string;
}): Promise<{
    success: boolean;
    restaurants?: Restaurant[];
    error?: string;
}>;
/**
 * Get detailed information about a specific restaurant
 */
export declare function getRestaurantDetails(restaurantId: string): Promise<{
    success: boolean;
    restaurant?: RestaurantDetails;
    error?: string;
}>;
/**
 * Check available reservation times for a restaurant
 */
export declare function checkAvailability(params: {
    restaurantId: string;
    date: string;
    time: string;
    partySize: number;
}): Promise<{
    success: boolean;
    slots?: AvailabilitySlot[];
    restaurantName?: string;
    error?: string;
}>;
/**
 * Make a reservation at a restaurant
 */
export declare function makeReservation(params: {
    restaurantId: string;
    date: string;
    time: string;
    partySize: number;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    specialRequests?: string;
    confirm: boolean;
}): Promise<{
    success: boolean;
    reservation?: Partial<Reservation>;
    requiresConfirmation?: boolean;
    preview?: {
        restaurantName: string;
        date: string;
        time: string;
        partySize: number;
        specialRequests?: string;
    };
    error?: string;
}>;
/**
 * Get list of upcoming reservations
 */
export declare function getReservations(): Promise<{
    success: boolean;
    reservations?: Reservation[];
    error?: string;
}>;
/**
 * Cancel a reservation
 */
export declare function cancelReservation(params: {
    reservationId: string;
    confirm: boolean;
}): Promise<{
    success: boolean;
    requiresConfirmation?: boolean;
    message?: string;
    error?: string;
}>;
/**
 * Cleanup browser resources
 */
export declare function cleanup(): Promise<void>;
