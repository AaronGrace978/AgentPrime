/**
 * AgentPrime - Plugin Marketplace Types
 * Plugin discovery, installation, and management system
 */

export interface MarketplacePlugin {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: {
    name: string;
    email?: string;
    url?: string;
  };
  publisher: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  categories: string[];
  engines: {
    agentprime: string;
  };
  icon?: string;
  galleryBanner?: {
    color?: string;
    theme?: string;
  };
  badges?: string[];
  preview?: boolean;
  verified?: boolean;
  starred?: boolean;
  installCount: number;
  rating: number;
  reviewCount: number;
  lastUpdated: number;
  releaseDate: number;
  assets: PluginAsset[];
  dependencies?: Record<string, string>;
  main?: string; // Entry point file (e.g., 'index.js')
}

export interface PluginAsset {
  type: 'archive' | 'signature' | 'manifest' | 'readme' | 'changelog';
  url: string;
  size: number;
  sha256: string;
}

export interface PluginInstallation {
  id: string;
  pluginId: string;
  version: string;
  installPath: string;
  installedAt: number;
  updatedAt: number;
  status: 'installed' | 'installing' | 'failed' | 'outdated';
  error?: string;
  autoUpdate: boolean;
}

export interface PluginReview {
  id: string;
  pluginId: string;
  userId: string;
  username: string;
  rating: number; // 1-5
  title: string;
  comment: string;
  createdAt: number;
  updatedAt: number;
  helpful: number;
  verified: boolean;
}

export interface MarketplaceSearchQuery {
  query?: string;
  category?: string;
  author?: string;
  tags?: string[];
  sortBy?: 'relevance' | 'installs' | 'rating' | 'updated' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  minRating?: number;
  verified?: boolean;
  preview?: boolean;
}

export interface MarketplaceSearchResult {
  plugins: MarketplacePlugin[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: {
    categories: { [category: string]: number };
    authors: { [author: string]: number };
    tags: { [tag: string]: number };
  };
}

export interface PluginUpdate {
  pluginId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  breaking: boolean;
  releaseDate: number;
}

export interface MarketplaceConfig {
  registryUrl: string;
  cacheExpiry: number; // minutes
  autoUpdate: boolean;
  updateCheckInterval: number; // minutes
  allowPreRelease: boolean;
  allowUnverified: boolean;
  trustedPublishers: string[];
}

export interface PluginPublisher {
  id: string;
  name: string;
  email: string;
  website?: string;
  verified: boolean;
  pluginCount: number;
  totalInstalls: number;
  averageRating: number;
  joinedDate: number;
}

export interface PluginStats {
  totalPlugins: number;
  totalInstalls: number;
  activeUsers: number;
  categories: { [category: string]: number };
  trending: MarketplacePlugin[];
  topRated: MarketplacePlugin[];
  mostDownloaded: MarketplacePlugin[];
  recentlyUpdated: MarketplacePlugin[];
}

export interface MarketplaceEvent {
  type: 'plugin_published' | 'plugin_updated' | 'plugin_unpublished' | 'review_added' | 'install_count_updated' |
        'plugin_installed' | 'plugin_uninstalled';
  pluginId: string;
  data: any;
  timestamp: number;
}
