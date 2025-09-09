import { RequestInit } from 'node-fetch';
export interface FetchSmartOptions extends RequestInit {
    retries?: number;
    timeout?: number;
    cacheTtl?: number;
}
export declare function iFetchSmart(url: string, options?: FetchSmartOptions): Promise<any>;
