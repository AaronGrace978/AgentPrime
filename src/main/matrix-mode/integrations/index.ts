/**
 * Matrix Mode Integrations
 * 23 service integrations for productivity, media, smart home, developer, and communication tools
 * 
 * Productivity: Notion, Google Calendar, Gmail, Todoist, Trello
 * Media: Spotify, YouTube, Giphy
 * Smart Home: Philips Hue, Home Assistant
 * Developer: GitHub, Linear, Jira, Vercel, Stripe, AWS S3
 * Communication: Twilio SMS, Twitter/X, SendGrid, Slack Webhook
 * Utilities: OpenWeatherMap, IFTTT, WolframAlpha
 */

import { EventEmitter } from 'events';

// Base types
export interface IntegrationConfig {
  id: string;
  name: string;
  category: IntegrationCategory;
  enabled: boolean;
  credentials?: Record<string, string>;
  settings?: Record<string, any>;
}

export type IntegrationCategory = 'productivity' | 'media' | 'smarthome' | 'communication' | 'developer' | 'custom';

export interface IntegrationAction {
  name: string;
  description: string;
  params: IntegrationParam[];
  execute: (params: Record<string, any>) => Promise<any>;
}

export interface IntegrationParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
}

/**
 * Base Integration Class
 */
export abstract class BaseIntegration extends EventEmitter {
  readonly id: string;
  readonly name: string;
  readonly category: IntegrationCategory;
  protected config: IntegrationConfig;
  protected connected: boolean = false;

  constructor(config: IntegrationConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.category = config.category;
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getActions(): IntegrationAction[];

  isConnected(): boolean {
    return this.connected;
  }

  protected getCredential(key: string): string | undefined {
    return this.config.credentials?.[key];
  }

  protected getSetting<T>(key: string, defaultValue: T): T {
    return this.config.settings?.[key] ?? defaultValue;
  }
}

// ============ Productivity Integrations ============

/**
 * Notion Integration
 */
export class NotionIntegration extends BaseIntegration {
  private apiKey: string = '';
  private apiUrl = 'https://api.notion.com/v1';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'notion', name: 'Notion', category: 'productivity' });
    this.apiKey = this.getCredential('apiKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('Notion API key required');
    
    // Verify connection
    const response = await fetch(`${this.apiUrl}/users/me`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': '2022-06-28'
      }
    });
    
    if (!response.ok) throw new Error('Invalid Notion API key');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'search',
        description: 'Search Notion pages and databases',
        params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }],
        execute: async (params) => this.search(params.query)
      },
      {
        name: 'createPage',
        description: 'Create a new Notion page',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Page title' },
          { name: 'content', type: 'string', required: false, description: 'Page content' },
          { name: 'parentId', type: 'string', required: false, description: 'Parent page ID' }
        ],
        execute: async (params) => this.createPage(params.title, params.content, params.parentId)
      },
      {
        name: 'appendToPage',
        description: 'Append content to a Notion page',
        params: [
          { name: 'pageId', type: 'string', required: true, description: 'Page ID' },
          { name: 'content', type: 'string', required: true, description: 'Content to append' }
        ],
        execute: async (params) => this.appendToPage(params.pageId, params.content)
      }
    ];
  }

  async search(query: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    return response.json();
  }

  async createPage(title: string, content?: string, parentId?: string): Promise<any> {
    const body: any = {
      parent: parentId 
        ? { page_id: parentId }
        : { type: 'page_id', page_id: this.getSetting('defaultParentId', '') },
      properties: {
        title: { title: [{ text: { content: title } }] }
      }
    };

    if (content) {
      body.children = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content } }]
          }
        }
      ];
    }

    const response = await fetch(`${this.apiUrl}/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async appendToPage(pageId: string, content: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        children: [{
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content } }]
          }
        }]
      })
    });
    return response.json();
  }
}

// ============ Media Integrations ============

/**
 * Spotify Integration
 */
export class SpotifyIntegration extends BaseIntegration {
  private accessToken: string = '';
  private refreshToken: string = '';
  private clientId: string = '';
  private clientSecret: string = '';
  private apiUrl = 'https://api.spotify.com/v1';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'spotify', name: 'Spotify', category: 'media' });
    this.accessToken = this.getCredential('accessToken') || '';
    this.refreshToken = this.getCredential('refreshToken') || '';
    this.clientId = this.getCredential('clientId') || '';
    this.clientSecret = this.getCredential('clientSecret') || '';
  }

  async connect(): Promise<void> {
    if (!this.accessToken && !this.refreshToken) {
      throw new Error('Spotify access token or refresh token required');
    }

    // Try to refresh token if needed
    if (this.refreshToken && !this.accessToken) {
      await this.refreshAccessToken();
    }

    // Verify connection
    const response = await fetch(`${this.apiUrl}/me`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` }
    });
    
    if (!response.ok) throw new Error('Invalid Spotify token');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
      },
      body: `grant_type=refresh_token&refresh_token=${this.refreshToken}`
    });
    const data = await response.json();
    this.accessToken = data.access_token;
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'play',
        description: 'Start playback',
        params: [{ name: 'uri', type: 'string', required: false, description: 'Track/album/playlist URI' }],
        execute: async (params) => this.play(params.uri)
      },
      {
        name: 'pause',
        description: 'Pause playback',
        params: [],
        execute: async () => this.pause()
      },
      {
        name: 'next',
        description: 'Skip to next track',
        params: [],
        execute: async () => this.next()
      },
      {
        name: 'previous',
        description: 'Go to previous track',
        params: [],
        execute: async () => this.previous()
      },
      {
        name: 'search',
        description: 'Search for tracks, artists, albums',
        params: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'type', type: 'string', required: false, description: 'track,artist,album,playlist' }
        ],
        execute: async (params) => this.search(params.query, params.type || 'track')
      },
      {
        name: 'nowPlaying',
        description: 'Get currently playing track',
        params: [],
        execute: async () => this.nowPlaying()
      },
      {
        name: 'setVolume',
        description: 'Set playback volume',
        params: [{ name: 'volume', type: 'number', required: true, description: '0-100' }],
        execute: async (params) => this.setVolume(params.volume)
      }
    ];
  }

  async play(uri?: string): Promise<any> {
    const body = uri ? { uris: [uri] } : {};
    return this.apiCall('me/player/play', 'PUT', body);
  }

  async pause(): Promise<any> {
    return this.apiCall('me/player/pause', 'PUT');
  }

  async next(): Promise<any> {
    return this.apiCall('me/player/next', 'POST');
  }

  async previous(): Promise<any> {
    return this.apiCall('me/player/previous', 'POST');
  }

  async search(query: string, type: string = 'track'): Promise<any> {
    return this.apiCall(`search?q=${encodeURIComponent(query)}&type=${type}`);
  }

  async nowPlaying(): Promise<any> {
    return this.apiCall('me/player/currently-playing');
  }

  async setVolume(volume: number): Promise<any> {
    return this.apiCall(`me/player/volume?volume_percent=${Math.min(100, Math.max(0, volume))}`, 'PUT');
  }

  private async apiCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const response = await fetch(`${this.apiUrl}/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (response.status === 204) return { success: true };
    return response.json();
  }
}

// ============ Smart Home Integrations ============

/**
 * Philips Hue Integration
 */
export class HueIntegration extends BaseIntegration {
  private bridgeIp: string = '';
  private username: string = '';
  private apiUrl: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'hue', name: 'Philips Hue', category: 'smarthome' });
    this.bridgeIp = this.getSetting('bridgeIp', '');
    this.username = this.getCredential('username') || '';
  }

  async connect(): Promise<void> {
    if (!this.bridgeIp || !this.username) {
      throw new Error('Hue bridge IP and username required');
    }
    
    this.apiUrl = `http://${this.bridgeIp}/api/${this.username}`;
    
    // Verify connection
    const response = await fetch(`${this.apiUrl}/lights`);
    if (!response.ok) throw new Error('Cannot connect to Hue bridge');
    
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getLights',
        description: 'Get all lights',
        params: [],
        execute: async () => this.getLights()
      },
      {
        name: 'setLight',
        description: 'Control a light',
        params: [
          { name: 'lightId', type: 'string', required: true, description: 'Light ID' },
          { name: 'on', type: 'boolean', required: false, description: 'On/off' },
          { name: 'brightness', type: 'number', required: false, description: '0-254' },
          { name: 'color', type: 'string', required: false, description: 'Color name or hex' }
        ],
        execute: async (params) => this.setLight(params.lightId, params)
      },
      {
        name: 'setAllLights',
        description: 'Control all lights',
        params: [
          { name: 'on', type: 'boolean', required: false, description: 'On/off' },
          { name: 'brightness', type: 'number', required: false, description: '0-254' }
        ],
        execute: async (params) => this.setAllLights(params)
      },
      {
        name: 'setScene',
        description: 'Activate a scene',
        params: [{ name: 'sceneId', type: 'string', required: true, description: 'Scene ID' }],
        execute: async (params) => this.setScene(params.sceneId)
      }
    ];
  }

  async getLights(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/lights`);
    return response.json();
  }

  async setLight(lightId: string, state: { on?: boolean; brightness?: number; color?: string }): Promise<any> {
    const body: any = {};
    if (state.on !== undefined) body.on = state.on;
    if (state.brightness !== undefined) body.bri = state.brightness;
    if (state.color) body.xy = this.colorToXY(state.color);

    const response = await fetch(`${this.apiUrl}/lights/${lightId}/state`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async setAllLights(state: { on?: boolean; brightness?: number }): Promise<any> {
    const body: any = {};
    if (state.on !== undefined) body.on = state.on;
    if (state.brightness !== undefined) body.bri = state.brightness;

    const response = await fetch(`${this.apiUrl}/groups/0/action`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async setScene(sceneId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/groups/0/action`, {
      method: 'PUT',
      body: JSON.stringify({ scene: sceneId })
    });
    return response.json();
  }

  private colorToXY(color: string): [number, number] {
    // Simple color name to XY conversion
    const colors: Record<string, [number, number]> = {
      red: [0.675, 0.322],
      green: [0.4091, 0.518],
      blue: [0.167, 0.04],
      yellow: [0.4317, 0.4996],
      purple: [0.2725, 0.1096],
      orange: [0.5614, 0.4156],
      white: [0.3227, 0.329]
    };
    return colors[color.toLowerCase()] || colors.white;
  }
}

// ============ Developer Integrations ============

/**
 * GitHub Integration
 */
export class GitHubIntegration extends BaseIntegration {
  private token: string = '';
  private apiUrl = 'https://api.github.com';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'github', name: 'GitHub', category: 'developer' });
    this.token = this.getCredential('token') || '';
  }

  async connect(): Promise<void> {
    if (!this.token) throw new Error('GitHub token required');
    
    const response = await fetch(`${this.apiUrl}/user`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    
    if (!response.ok) throw new Error('Invalid GitHub token');
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getRepos',
        description: 'List repositories',
        params: [{ name: 'user', type: 'string', required: false, description: 'Username (default: authenticated user)' }],
        execute: async (params) => this.getRepos(params.user)
      },
      {
        name: 'createIssue',
        description: 'Create a GitHub issue',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' },
          { name: 'title', type: 'string', required: true, description: 'Issue title' },
          { name: 'body', type: 'string', required: false, description: 'Issue body' }
        ],
        execute: async (params) => this.createIssue(params.owner, params.repo, params.title, params.body)
      },
      {
        name: 'getIssues',
        description: 'List repository issues',
        params: [
          { name: 'owner', type: 'string', required: true, description: 'Repository owner' },
          { name: 'repo', type: 'string', required: true, description: 'Repository name' }
        ],
        execute: async (params) => this.getIssues(params.owner, params.repo)
      }
    ];
  }

  async getRepos(user?: string): Promise<any> {
    const endpoint = user ? `users/${user}/repos` : 'user/repos';
    const response = await fetch(`${this.apiUrl}/${endpoint}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }

  async createIssue(owner: string, repo: string, title: string, body?: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body })
    });
    return response.json();
  }

  async getIssues(owner: string, repo: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/repos/${owner}/${repo}/issues`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return response.json();
  }
}

// ============ Productivity - Google Calendar ============

export class GoogleCalendarIntegration extends BaseIntegration {
  private accessToken: string = '';
  private refreshTokenValue: string = '';
  private clientId: string = '';
  private clientSecret: string = '';
  private apiUrl = 'https://www.googleapis.com/calendar/v3';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'google-calendar', name: 'Google Calendar', category: 'productivity' });
    this.accessToken = this.getCredential('accessToken') || '';
    this.refreshTokenValue = this.getCredential('refreshToken') || '';
    this.clientId = this.getCredential('clientId') || '';
    this.clientSecret = this.getCredential('clientSecret') || '';
  }

  async connect(): Promise<void> {
    if (!this.accessToken && !this.refreshTokenValue) {
      throw new Error('Google Calendar access token or refresh token required');
    }
    if (this.refreshTokenValue && (!this.accessToken || this.isTokenExpired())) {
      await this.refreshAccessToken();
    }
    const response = await fetch(`${this.apiUrl}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!response.ok) throw new Error('Invalid Google Calendar credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private isTokenExpired(): boolean { return false; } // Token refresh handled on 401

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshTokenValue,
        client_id: this.clientId,
        client_secret: this.clientSecret
      })
    });
    const data = await response.json();
    if (data.access_token) this.accessToken = data.access_token;
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'listEvents',
        description: 'List upcoming calendar events',
        params: [
          { name: 'maxResults', type: 'number', required: false, description: 'Max events to return' },
          { name: 'calendarId', type: 'string', required: false, description: 'Calendar ID (default: primary)' }
        ],
        execute: async (params) => this.listEvents(params.maxResults || 10, params.calendarId)
      },
      {
        name: 'createEvent',
        description: 'Create a new calendar event',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Event title' },
          { name: 'startTime', type: 'string', required: true, description: 'Start time (ISO 8601)' },
          { name: 'endTime', type: 'string', required: true, description: 'End time (ISO 8601)' },
          { name: 'description', type: 'string', required: false, description: 'Event description' },
          { name: 'location', type: 'string', required: false, description: 'Event location' },
          { name: 'attendees', type: 'array', required: false, description: 'Array of attendee emails' }
        ],
        execute: async (params) => this.createEvent(params)
      },
      {
        name: 'deleteEvent',
        description: 'Delete a calendar event',
        params: [
          { name: 'eventId', type: 'string', required: true, description: 'Event ID' },
          { name: 'calendarId', type: 'string', required: false, description: 'Calendar ID' }
        ],
        execute: async (params) => this.deleteEvent(params.eventId, params.calendarId)
      },
      {
        name: 'findFreeTime',
        description: 'Find free/busy times',
        params: [
          { name: 'timeMin', type: 'string', required: true, description: 'Start of range (ISO 8601)' },
          { name: 'timeMax', type: 'string', required: true, description: 'End of range (ISO 8601)' }
        ],
        execute: async (params) => this.findFreeTime(params.timeMin, params.timeMax)
      }
    ];
  }

  async listEvents(maxResults: number = 10, calendarId: string = 'primary'): Promise<any> {
    const now = new Date().toISOString();
    const response = await fetch(
      `${this.apiUrl}/calendars/${calendarId}/events?timeMin=${now}&maxResults=${maxResults}&orderBy=startTime&singleEvents=true`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } }
    );
    return response.json();
  }

  async createEvent(params: {
    title: string; startTime: string; endTime: string;
    description?: string; location?: string; attendees?: string[];
  }): Promise<any> {
    const event: any = {
      summary: params.title,
      start: { dateTime: params.startTime },
      end: { dateTime: params.endTime }
    };
    if (params.description) event.description = params.description;
    if (params.location) event.location = params.location;
    if (params.attendees) event.attendees = params.attendees.map(e => ({ email: e }));

    const response = await fetch(`${this.apiUrl}/calendars/primary/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    return response.json();
  }

  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<any> {
    const response = await fetch(`${this.apiUrl}/calendars/${calendarId}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    return { success: response.ok };
  }

  async findFreeTime(timeMin: string, timeMax: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin, timeMax,
        items: [{ id: 'primary' }]
      })
    });
    return response.json();
  }
}

// ============ Productivity - Gmail ============

export class GmailIntegration extends BaseIntegration {
  private accessToken: string = '';
  private apiUrl = 'https://gmail.googleapis.com/gmail/v1';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'gmail', name: 'Gmail', category: 'productivity' });
    this.accessToken = this.getCredential('accessToken') || '';
  }

  async connect(): Promise<void> {
    if (!this.accessToken) throw new Error('Gmail access token required');
    const response = await fetch(`${this.apiUrl}/users/me/profile`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!response.ok) throw new Error('Invalid Gmail credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'listMessages',
        description: 'List recent emails',
        params: [
          { name: 'query', type: 'string', required: false, description: 'Search query (Gmail syntax)' },
          { name: 'maxResults', type: 'number', required: false, description: 'Max results' }
        ],
        execute: async (params) => this.listMessages(params.query, params.maxResults)
      },
      {
        name: 'readMessage',
        description: 'Read a specific email',
        params: [{ name: 'messageId', type: 'string', required: true, description: 'Message ID' }],
        execute: async (params) => this.readMessage(params.messageId)
      },
      {
        name: 'sendEmail',
        description: 'Send an email',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Recipient email' },
          { name: 'subject', type: 'string', required: true, description: 'Email subject' },
          { name: 'body', type: 'string', required: true, description: 'Email body (plain text or HTML)' },
          { name: 'cc', type: 'string', required: false, description: 'CC recipients' }
        ],
        execute: async (params) => this.sendEmail(params.to, params.subject, params.body, params.cc)
      },
      {
        name: 'searchEmails',
        description: 'Search emails with Gmail query syntax',
        params: [{ name: 'query', type: 'string', required: true, description: 'Search query' }],
        execute: async (params) => this.listMessages(params.query, 20)
      }
    ];
  }

  async listMessages(query?: string, maxResults: number = 10): Promise<any> {
    let url = `${this.apiUrl}/users/me/messages?maxResults=${maxResults}`;
    if (query) url += `&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.accessToken}` } });
    return response.json();
  }

  async readMessage(messageId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    return response.json();
  }

  async sendEmail(to: string, subject: string, body: string, cc?: string): Promise<any> {
    const headers = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/html; charset=utf-8'];
    if (cc) headers.push(`Cc: ${cc}`);
    const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`).toString('base64url');
    const response = await fetch(`${this.apiUrl}/users/me/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw })
    });
    return response.json();
  }
}

// ============ Productivity - Todoist ============

export class TodoistIntegration extends BaseIntegration {
  private apiKey: string = '';
  private apiUrl = 'https://api.todoist.com/rest/v2';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'todoist', name: 'Todoist', category: 'productivity' });
    this.apiKey = this.getCredential('apiKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('Todoist API key required');
    const response = await fetch(`${this.apiUrl}/projects`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    if (!response.ok) throw new Error('Invalid Todoist API key');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getTasks',
        description: 'Get all active tasks',
        params: [
          { name: 'projectId', type: 'string', required: false, description: 'Filter by project' },
          { name: 'filter', type: 'string', required: false, description: 'Todoist filter query' }
        ],
        execute: async (params) => this.getTasks(params.projectId, params.filter)
      },
      {
        name: 'createTask',
        description: 'Create a new task',
        params: [
          { name: 'content', type: 'string', required: true, description: 'Task content' },
          { name: 'description', type: 'string', required: false, description: 'Task description' },
          { name: 'dueString', type: 'string', required: false, description: 'Due date in natural language' },
          { name: 'priority', type: 'number', required: false, description: 'Priority 1-4' },
          { name: 'projectId', type: 'string', required: false, description: 'Project ID' }
        ],
        execute: async (params) => this.createTask(params)
      },
      {
        name: 'completeTask',
        description: 'Mark a task as complete',
        params: [{ name: 'taskId', type: 'string', required: true, description: 'Task ID' }],
        execute: async (params) => this.completeTask(params.taskId)
      },
      {
        name: 'getProjects',
        description: 'List all projects',
        params: [],
        execute: async () => this.getProjects()
      }
    ];
  }

  async getTasks(projectId?: string, filter?: string): Promise<any> {
    let url = `${this.apiUrl}/tasks`;
    const params: string[] = [];
    if (projectId) params.push(`project_id=${projectId}`);
    if (filter) params.push(`filter=${encodeURIComponent(filter)}`);
    if (params.length) url += `?${params.join('&')}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    return response.json();
  }

  async createTask(params: { content: string; description?: string; dueString?: string; priority?: number; projectId?: string }): Promise<any> {
    const body: any = { content: params.content };
    if (params.description) body.description = params.description;
    if (params.dueString) body.due_string = params.dueString;
    if (params.priority) body.priority = params.priority;
    if (params.projectId) body.project_id = params.projectId;
    const response = await fetch(`${this.apiUrl}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  async completeTask(taskId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/tasks/${taskId}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    return { success: response.ok };
  }

  async getProjects(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/projects`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    return response.json();
  }
}

// ============ Developer - Linear ============

export class LinearIntegration extends BaseIntegration {
  private apiKey: string = '';
  private apiUrl = 'https://api.linear.app/graphql';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'linear', name: 'Linear', category: 'developer' });
    this.apiKey = this.getCredential('apiKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('Linear API key required');
    const result = await this.graphql('{ viewer { id name email } }');
    if (result.errors) throw new Error('Invalid Linear API key');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private async graphql(query: string, variables?: Record<string, any>): Promise<any> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { Authorization: this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    return response.json();
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getIssues',
        description: 'Get issues assigned to me or by filter',
        params: [{ name: 'filter', type: 'string', required: false, description: 'Filter: mine, all, backlog' }],
        execute: async (params) => this.getIssues(params.filter)
      },
      {
        name: 'createIssue',
        description: 'Create a new issue',
        params: [
          { name: 'title', type: 'string', required: true, description: 'Issue title' },
          { name: 'description', type: 'string', required: false, description: 'Issue description (markdown)' },
          { name: 'teamId', type: 'string', required: true, description: 'Team ID' },
          { name: 'priority', type: 'number', required: false, description: 'Priority 0-4' }
        ],
        execute: async (params) => this.createIssue(params)
      },
      {
        name: 'updateIssue',
        description: 'Update an issue status',
        params: [
          { name: 'issueId', type: 'string', required: true, description: 'Issue ID' },
          { name: 'stateId', type: 'string', required: false, description: 'New state ID' },
          { name: 'assigneeId', type: 'string', required: false, description: 'Assignee user ID' }
        ],
        execute: async (params) => this.updateIssue(params)
      },
      {
        name: 'getTeams',
        description: 'List teams',
        params: [],
        execute: async () => this.getTeams()
      }
    ];
  }

  async getIssues(filter: string = 'mine'): Promise<any> {
    const filterClause = filter === 'mine' ? 'assignedTo: { isMe: { eq: true } }' : '';
    return this.graphql(`{ issues(filter: { ${filterClause} }, first: 25) { nodes { id identifier title state { name } priority assignee { name } } } }`);
  }

  async createIssue(params: { title: string; description?: string; teamId: string; priority?: number }): Promise<any> {
    return this.graphql(
      `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title url } } }`,
      { input: { title: params.title, description: params.description, teamId: params.teamId, priority: params.priority } }
    );
  }

  async updateIssue(params: { issueId: string; stateId?: string; assigneeId?: string }): Promise<any> {
    const input: any = {};
    if (params.stateId) input.stateId = params.stateId;
    if (params.assigneeId) input.assigneeId = params.assigneeId;
    return this.graphql(
      `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
      { id: params.issueId, input }
    );
  }

  async getTeams(): Promise<any> {
    return this.graphql('{ teams { nodes { id name key } } }');
  }
}

// ============ Developer - Jira ============

export class JiraIntegration extends BaseIntegration {
  private email: string = '';
  private apiToken: string = '';
  private domain: string = '';
  private apiUrl: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'jira', name: 'Jira', category: 'developer' });
    this.email = this.getCredential('email') || '';
    this.apiToken = this.getCredential('apiToken') || '';
    this.domain = this.getSetting('domain', '');
    this.apiUrl = `https://${this.domain}.atlassian.net/rest/api/3`;
  }

  async connect(): Promise<void> {
    if (!this.email || !this.apiToken || !this.domain) throw new Error('Jira email, API token, and domain required');
    const response = await fetch(`${this.apiUrl}/myself`, { headers: this.authHeaders() });
    if (!response.ok) throw new Error('Invalid Jira credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Basic ${Buffer.from(`${this.email}:${this.apiToken}`).toString('base64')}`,
      'Content-Type': 'application/json'
    };
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'searchIssues',
        description: 'Search Jira issues with JQL',
        params: [{ name: 'jql', type: 'string', required: true, description: 'JQL query string' }],
        execute: async (params) => this.search(params.jql)
      },
      {
        name: 'createIssue',
        description: 'Create a Jira issue',
        params: [
          { name: 'projectKey', type: 'string', required: true, description: 'Project key (e.g. PROJ)' },
          { name: 'summary', type: 'string', required: true, description: 'Issue summary' },
          { name: 'issueType', type: 'string', required: false, description: 'Issue type (Task, Bug, Story)' },
          { name: 'description', type: 'string', required: false, description: 'Description' }
        ],
        execute: async (params) => this.createIssue(params)
      },
      {
        name: 'transitionIssue',
        description: 'Transition issue to new status',
        params: [
          { name: 'issueKey', type: 'string', required: true, description: 'Issue key (e.g. PROJ-123)' },
          { name: 'transitionId', type: 'string', required: true, description: 'Transition ID' }
        ],
        execute: async (params) => this.transitionIssue(params.issueKey, params.transitionId)
      },
      {
        name: 'addComment',
        description: 'Add a comment to an issue',
        params: [
          { name: 'issueKey', type: 'string', required: true, description: 'Issue key' },
          { name: 'body', type: 'string', required: true, description: 'Comment text' }
        ],
        execute: async (params) => this.addComment(params.issueKey, params.body)
      }
    ];
  }

  async search(jql: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/search?jql=${encodeURIComponent(jql)}&maxResults=25`, { headers: this.authHeaders() });
    return response.json();
  }

  async createIssue(params: { projectKey: string; summary: string; issueType?: string; description?: string }): Promise<any> {
    const body: any = {
      fields: {
        project: { key: params.projectKey },
        summary: params.summary,
        issuetype: { name: params.issueType || 'Task' }
      }
    };
    if (params.description) {
      body.fields.description = { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: params.description }] }] };
    }
    const response = await fetch(`${this.apiUrl}/issue`, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify(body) });
    return response.json();
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/issue/${issueKey}/transitions`, {
      method: 'POST', headers: this.authHeaders(),
      body: JSON.stringify({ transition: { id: transitionId } })
    });
    return { success: response.ok };
  }

  async addComment(issueKey: string, text: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/issue/${issueKey}/comment`, {
      method: 'POST', headers: this.authHeaders(),
      body: JSON.stringify({ body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] } })
    });
    return response.json();
  }
}

// ============ Developer - Vercel ============

export class VercelIntegration extends BaseIntegration {
  private token: string = '';
  private apiUrl = 'https://api.vercel.com';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'vercel', name: 'Vercel', category: 'developer' });
    this.token = this.getCredential('token') || '';
  }

  async connect(): Promise<void> {
    if (!this.token) throw new Error('Vercel token required');
    const response = await fetch(`${this.apiUrl}/v2/user`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Invalid Vercel token');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'listDeployments',
        description: 'List recent deployments',
        params: [{ name: 'projectId', type: 'string', required: false, description: 'Filter by project' }],
        execute: async (params) => this.listDeployments(params.projectId)
      },
      {
        name: 'listProjects',
        description: 'List all projects',
        params: [],
        execute: async () => this.listProjects()
      },
      {
        name: 'getDeployment',
        description: 'Get deployment details',
        params: [{ name: 'deploymentId', type: 'string', required: true, description: 'Deployment ID or URL' }],
        execute: async (params) => this.getDeployment(params.deploymentId)
      },
      {
        name: 'redeploy',
        description: 'Redeploy a project',
        params: [{ name: 'deploymentId', type: 'string', required: true, description: 'Deployment ID to redeploy' }],
        execute: async (params) => this.redeploy(params.deploymentId)
      }
    ];
  }

  async listDeployments(projectId?: string): Promise<any> {
    let url = `${this.apiUrl}/v6/deployments?limit=20`;
    if (projectId) url += `&projectId=${projectId}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    return response.json();
  }

  async listProjects(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/v9/projects`, { headers: { Authorization: `Bearer ${this.token}` } });
    return response.json();
  }

  async getDeployment(deploymentId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/v13/deployments/${deploymentId}`, { headers: { Authorization: `Bearer ${this.token}` } });
    return response.json();
  }

  async redeploy(deploymentId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/v13/deployments?forceNew=1`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: deploymentId, target: 'production' })
    });
    return response.json();
  }
}

// ============ Smart Home - Home Assistant ============

export class HomeAssistantIntegration extends BaseIntegration {
  private token: string = '';
  private url: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'home-assistant', name: 'Home Assistant', category: 'smarthome' });
    this.token = this.getCredential('token') || '';
    this.url = this.getSetting('url', 'http://homeassistant.local:8123');
  }

  async connect(): Promise<void> {
    if (!this.token) throw new Error('Home Assistant long-lived access token required');
    const response = await fetch(`${this.url}/api/`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Cannot connect to Home Assistant');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getStates',
        description: 'Get all entity states',
        params: [],
        execute: async () => this.getStates()
      },
      {
        name: 'getState',
        description: 'Get state of a specific entity',
        params: [{ name: 'entityId', type: 'string', required: true, description: 'Entity ID (e.g. light.living_room)' }],
        execute: async (params) => this.getState(params.entityId)
      },
      {
        name: 'callService',
        description: 'Call a Home Assistant service',
        params: [
          { name: 'domain', type: 'string', required: true, description: 'Service domain (light, switch, climate, etc.)' },
          { name: 'service', type: 'string', required: true, description: 'Service name (turn_on, turn_off, etc.)' },
          { name: 'entityId', type: 'string', required: true, description: 'Target entity ID' },
          { name: 'data', type: 'object', required: false, description: 'Additional service data' }
        ],
        execute: async (params) => this.callService(params.domain, params.service, params.entityId, params.data)
      },
      {
        name: 'toggleEntity',
        description: 'Toggle an entity on/off',
        params: [{ name: 'entityId', type: 'string', required: true, description: 'Entity ID' }],
        execute: async (params) => this.callService('homeassistant', 'toggle', params.entityId)
      },
      {
        name: 'setClimate',
        description: 'Set thermostat temperature',
        params: [
          { name: 'entityId', type: 'string', required: true, description: 'Climate entity ID' },
          { name: 'temperature', type: 'number', required: true, description: 'Target temperature' },
          { name: 'hvacMode', type: 'string', required: false, description: 'HVAC mode (heat, cool, auto)' }
        ],
        execute: async (params) => this.callService('climate', 'set_temperature', params.entityId, {
          temperature: params.temperature, hvac_mode: params.hvacMode
        })
      }
    ];
  }

  async getStates(): Promise<any> {
    const response = await fetch(`${this.url}/api/states`, { headers: { Authorization: `Bearer ${this.token}` } });
    return response.json();
  }

  async getState(entityId: string): Promise<any> {
    const response = await fetch(`${this.url}/api/states/${entityId}`, { headers: { Authorization: `Bearer ${this.token}` } });
    return response.json();
  }

  async callService(domain: string, service: string, entityId: string, data?: any): Promise<any> {
    const response = await fetch(`${this.url}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: entityId, ...data })
    });
    return response.json();
  }
}

// ============ Communication - Twilio SMS ============

export class TwilioIntegration extends BaseIntegration {
  private accountSid: string = '';
  private authToken: string = '';
  private fromNumber: string = '';
  private apiUrl: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'twilio', name: 'Twilio SMS', category: 'communication' });
    this.accountSid = this.getCredential('accountSid') || '';
    this.authToken = this.getCredential('authToken') || '';
    this.fromNumber = this.getSetting('fromNumber', '');
    this.apiUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}`;
  }

  async connect(): Promise<void> {
    if (!this.accountSid || !this.authToken) throw new Error('Twilio Account SID and Auth Token required');
    const response = await fetch(`${this.apiUrl}.json`, { headers: this.authHeaders() });
    if (!response.ok) throw new Error('Invalid Twilio credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}` };
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'sendSMS',
        description: 'Send an SMS message',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Recipient phone number (+E.164)' },
          { name: 'body', type: 'string', required: true, description: 'Message body' }
        ],
        execute: async (params) => this.sendSMS(params.to, params.body)
      },
      {
        name: 'getMessages',
        description: 'Get recent messages',
        params: [{ name: 'limit', type: 'number', required: false, description: 'Max messages' }],
        execute: async (params) => this.getMessages(params.limit)
      },
      {
        name: 'makeCall',
        description: 'Initiate a phone call with TTS',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Phone number to call' },
          { name: 'message', type: 'string', required: true, description: 'Message to speak' }
        ],
        execute: async (params) => this.makeCall(params.to, params.message)
      }
    ];
  }

  async sendSMS(to: string, body: string): Promise<any> {
    const formData = new URLSearchParams({ To: to, From: this.fromNumber, Body: body });
    const response = await fetch(`${this.apiUrl}/Messages.json`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });
    return response.json();
  }

  async getMessages(limit: number = 20): Promise<any> {
    const response = await fetch(`${this.apiUrl}/Messages.json?PageSize=${limit}`, { headers: this.authHeaders() });
    return response.json();
  }

  async makeCall(to: string, message: string): Promise<any> {
    const twiml = `<Response><Say>${message}</Say></Response>`;
    const formData = new URLSearchParams({ To: to, From: this.fromNumber, Twiml: twiml });
    const response = await fetch(`${this.apiUrl}/Calls.json`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });
    return response.json();
  }
}

// ============ Utilities - OpenWeatherMap ============

export class WeatherIntegration extends BaseIntegration {
  private apiKey: string = '';
  private apiUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'weather', name: 'OpenWeatherMap', category: 'custom' });
    this.apiKey = this.getCredential('apiKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('OpenWeatherMap API key required');
    this.connected = true; // API key verified on first call
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getCurrentWeather',
        description: 'Get current weather for a location',
        params: [
          { name: 'city', type: 'string', required: false, description: 'City name' },
          { name: 'lat', type: 'number', required: false, description: 'Latitude' },
          { name: 'lon', type: 'number', required: false, description: 'Longitude' }
        ],
        execute: async (params) => this.getCurrentWeather(params.city, params.lat, params.lon)
      },
      {
        name: 'getForecast',
        description: 'Get 5-day weather forecast',
        params: [{ name: 'city', type: 'string', required: true, description: 'City name' }],
        execute: async (params) => this.getForecast(params.city)
      }
    ];
  }

  async getCurrentWeather(city?: string, lat?: number, lon?: number): Promise<any> {
    let url = `${this.apiUrl}/weather?appid=${this.apiKey}&units=metric`;
    if (city) url += `&q=${encodeURIComponent(city)}`;
    else if (lat !== undefined && lon !== undefined) url += `&lat=${lat}&lon=${lon}`;
    const response = await fetch(url);
    return response.json();
  }

  async getForecast(city: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/forecast?q=${encodeURIComponent(city)}&appid=${this.apiKey}&units=metric`);
    return response.json();
  }
}

// ============ Media - YouTube ============

export class YouTubeIntegration extends BaseIntegration {
  private apiKey: string = '';
  private accessToken: string = '';
  private apiUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'youtube', name: 'YouTube', category: 'media' });
    this.apiKey = this.getCredential('apiKey') || '';
    this.accessToken = this.getCredential('accessToken') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey && !this.accessToken) throw new Error('YouTube API key or access token required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private get authParam(): string {
    return this.accessToken ? '' : `&key=${this.apiKey}`;
  }
  private get authHeaders(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'search',
        description: 'Search YouTube videos',
        params: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'maxResults', type: 'number', required: false, description: 'Max results (default 5)' }
        ],
        execute: async (params) => this.search(params.query, params.maxResults)
      },
      {
        name: 'getVideo',
        description: 'Get video details',
        params: [{ name: 'videoId', type: 'string', required: true, description: 'Video ID' }],
        execute: async (params) => this.getVideo(params.videoId)
      },
      {
        name: 'getPlaylist',
        description: 'Get playlist items',
        params: [{ name: 'playlistId', type: 'string', required: true, description: 'Playlist ID' }],
        execute: async (params) => this.getPlaylist(params.playlistId)
      },
      {
        name: 'getTrending',
        description: 'Get trending videos',
        params: [{ name: 'regionCode', type: 'string', required: false, description: 'Region (e.g. US, GB)' }],
        execute: async (params) => this.getTrending(params.regionCode)
      }
    ];
  }

  async search(query: string, maxResults: number = 5): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${maxResults}${this.authParam}`,
      { headers: this.authHeaders }
    );
    return response.json();
  }

  async getVideo(videoId: string): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/videos?part=snippet,statistics,contentDetails&id=${videoId}${this.authParam}`,
      { headers: this.authHeaders }
    );
    return response.json();
  }

  async getPlaylist(playlistId: string): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=25${this.authParam}`,
      { headers: this.authHeaders }
    );
    return response.json();
  }

  async getTrending(regionCode: string = 'US'): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=10${this.authParam}`,
      { headers: this.authHeaders }
    );
    return response.json();
  }
}

// ============ Productivity - Trello ============

export class TrelloIntegration extends BaseIntegration {
  private apiKey: string = '';
  private token: string = '';
  private apiUrl = 'https://api.trello.com/1';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'trello', name: 'Trello', category: 'productivity' });
    this.apiKey = this.getCredential('apiKey') || '';
    this.token = this.getCredential('token') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey || !this.token) throw new Error('Trello API key and token required');
    const response = await fetch(`${this.apiUrl}/members/me?key=${this.apiKey}&token=${this.token}`);
    if (!response.ok) throw new Error('Invalid Trello credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private get auth(): string { return `key=${this.apiKey}&token=${this.token}`; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getBoards',
        description: 'List your Trello boards',
        params: [],
        execute: async () => this.getBoards()
      },
      {
        name: 'getLists',
        description: 'Get lists on a board',
        params: [{ name: 'boardId', type: 'string', required: true, description: 'Board ID' }],
        execute: async (params) => this.getLists(params.boardId)
      },
      {
        name: 'getCards',
        description: 'Get cards on a list',
        params: [{ name: 'listId', type: 'string', required: true, description: 'List ID' }],
        execute: async (params) => this.getCards(params.listId)
      },
      {
        name: 'createCard',
        description: 'Create a card',
        params: [
          { name: 'listId', type: 'string', required: true, description: 'List ID' },
          { name: 'name', type: 'string', required: true, description: 'Card title' },
          { name: 'desc', type: 'string', required: false, description: 'Card description' }
        ],
        execute: async (params) => this.createCard(params.listId, params.name, params.desc)
      },
      {
        name: 'moveCard',
        description: 'Move a card to a different list',
        params: [
          { name: 'cardId', type: 'string', required: true, description: 'Card ID' },
          { name: 'listId', type: 'string', required: true, description: 'Destination list ID' }
        ],
        execute: async (params) => this.moveCard(params.cardId, params.listId)
      }
    ];
  }

  async getBoards(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/members/me/boards?${this.auth}`);
    return response.json();
  }

  async getLists(boardId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/boards/${boardId}/lists?${this.auth}`);
    return response.json();
  }

  async getCards(listId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/lists/${listId}/cards?${this.auth}`);
    return response.json();
  }

  async createCard(listId: string, name: string, desc?: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/cards?${this.auth}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idList: listId, name, desc })
    });
    return response.json();
  }

  async moveCard(cardId: string, listId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/cards/${cardId}?${this.auth}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idList: listId })
    });
    return response.json();
  }
}

// ============ Communication - Twitter/X ============

export class TwitterIntegration extends BaseIntegration {
  private bearerToken: string = '';
  private apiUrl = 'https://api.twitter.com/2';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'twitter', name: 'Twitter/X', category: 'communication' });
    this.bearerToken = this.getCredential('bearerToken') || '';
  }

  async connect(): Promise<void> {
    if (!this.bearerToken) throw new Error('Twitter Bearer Token required');
    const response = await fetch(`${this.apiUrl}/users/me`, { headers: { Authorization: `Bearer ${this.bearerToken}` } });
    if (!response.ok) throw new Error('Invalid Twitter credentials');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'searchTweets',
        description: 'Search recent tweets',
        params: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'maxResults', type: 'number', required: false, description: 'Max results (10-100)' }
        ],
        execute: async (params) => this.searchTweets(params.query, params.maxResults)
      },
      {
        name: 'postTweet',
        description: 'Post a tweet',
        params: [{ name: 'text', type: 'string', required: true, description: 'Tweet text' }],
        execute: async (params) => this.postTweet(params.text)
      },
      {
        name: 'getUserTimeline',
        description: 'Get user timeline',
        params: [{ name: 'userId', type: 'string', required: true, description: 'User ID' }],
        execute: async (params) => this.getUserTimeline(params.userId)
      },
      {
        name: 'getTrending',
        description: 'Get trending topics',
        params: [{ name: 'woeid', type: 'number', required: false, description: 'Where On Earth ID (1 for worldwide)' }],
        execute: async (params) => this.getTrending(params.woeid)
      }
    ];
  }

  async searchTweets(query: string, maxResults: number = 10): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${Math.max(10, Math.min(100, maxResults))}&tweet.fields=created_at,public_metrics`,
      { headers: { Authorization: `Bearer ${this.bearerToken}` } }
    );
    return response.json();
  }

  async postTweet(text: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/tweets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return response.json();
  }

  async getUserTimeline(userId: string): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics`,
      { headers: { Authorization: `Bearer ${this.bearerToken}` } }
    );
    return response.json();
  }

  async getTrending(woeid: number = 1): Promise<any> {
    const response = await fetch(
      `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`,
      { headers: { Authorization: `Bearer ${this.bearerToken}` } }
    );
    return response.json();
  }
}

// ============ Communication - SendGrid Email ============

export class SendGridIntegration extends BaseIntegration {
  private apiKey: string = '';
  private fromEmail: string = '';
  private apiUrl = 'https://api.sendgrid.com/v3';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'sendgrid', name: 'SendGrid', category: 'communication' });
    this.apiKey = this.getCredential('apiKey') || '';
    this.fromEmail = this.getSetting('fromEmail', '');
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('SendGrid API key required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'sendEmail',
        description: 'Send an email via SendGrid',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Recipient email' },
          { name: 'subject', type: 'string', required: true, description: 'Subject' },
          { name: 'content', type: 'string', required: true, description: 'Email body (HTML)' }
        ],
        execute: async (params) => this.sendEmail(params.to, params.subject, params.content)
      },
      {
        name: 'sendTemplate',
        description: 'Send email using a template',
        params: [
          { name: 'to', type: 'string', required: true, description: 'Recipient email' },
          { name: 'templateId', type: 'string', required: true, description: 'Template ID' },
          { name: 'dynamicData', type: 'object', required: false, description: 'Template data' }
        ],
        execute: async (params) => this.sendTemplate(params.to, params.templateId, params.dynamicData)
      }
    ];
  }

  async sendEmail(to: string, subject: string, content: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/mail/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromEmail },
        subject,
        content: [{ type: 'text/html', value: content }]
      })
    });
    return { success: response.ok, status: response.status };
  }

  async sendTemplate(to: string, templateId: string, dynamicData?: any): Promise<any> {
    const response = await fetch(`${this.apiUrl}/mail/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], dynamic_template_data: dynamicData }],
        from: { email: this.fromEmail },
        template_id: templateId
      })
    });
    return { success: response.ok, status: response.status };
  }
}

// ============ Developer - Stripe ============

export class StripeIntegration extends BaseIntegration {
  private secretKey: string = '';
  private apiUrl = 'https://api.stripe.com/v1';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'stripe', name: 'Stripe', category: 'developer' });
    this.secretKey = this.getCredential('secretKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.secretKey) throw new Error('Stripe secret key required');
    const response = await fetch(`${this.apiUrl}/balance`, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    if (!response.ok) throw new Error('Invalid Stripe key');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'getBalance',
        description: 'Get account balance',
        params: [],
        execute: async () => this.getBalance()
      },
      {
        name: 'listPayments',
        description: 'List recent payments',
        params: [{ name: 'limit', type: 'number', required: false, description: 'Max results' }],
        execute: async (params) => this.listPayments(params.limit)
      },
      {
        name: 'getCustomer',
        description: 'Get customer details',
        params: [{ name: 'customerId', type: 'string', required: true, description: 'Customer ID' }],
        execute: async (params) => this.getCustomer(params.customerId)
      },
      {
        name: 'createPaymentLink',
        description: 'Create a payment link',
        params: [
          { name: 'amount', type: 'number', required: true, description: 'Amount in cents' },
          { name: 'currency', type: 'string', required: false, description: 'Currency (default: usd)' },
          { name: 'productName', type: 'string', required: true, description: 'Product name' }
        ],
        execute: async (params) => this.createPaymentLink(params.amount, params.productName, params.currency)
      }
    ];
  }

  async getBalance(): Promise<any> {
    const response = await fetch(`${this.apiUrl}/balance`, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    return response.json();
  }

  async listPayments(limit: number = 10): Promise<any> {
    const response = await fetch(`${this.apiUrl}/payment_intents?limit=${limit}`, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    return response.json();
  }

  async getCustomer(customerId: string): Promise<any> {
    const response = await fetch(`${this.apiUrl}/customers/${customerId}`, { headers: { Authorization: `Bearer ${this.secretKey}` } });
    return response.json();
  }

  async createPaymentLink(amount: number, productName: string, currency: string = 'usd'): Promise<any> {
    const priceResponse = await fetch(`${this.apiUrl}/prices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ unit_amount: amount.toString(), currency, 'product_data[name]': productName })
    });
    const price = await priceResponse.json();
    const linkResponse = await fetch(`${this.apiUrl}/payment_links`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'line_items[0][price]': price.id, 'line_items[0][quantity]': '1' })
    });
    return linkResponse.json();
  }
}

// ============ Utilities - IFTTT ============

export class IFTTTIntegration extends BaseIntegration {
  private webhookKey: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'ifttt', name: 'IFTTT', category: 'custom' });
    this.webhookKey = this.getCredential('webhookKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.webhookKey) throw new Error('IFTTT Webhook key required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'trigger',
        description: 'Trigger an IFTTT webhook event',
        params: [
          { name: 'event', type: 'string', required: true, description: 'Event name' },
          { name: 'value1', type: 'string', required: false, description: 'Value 1' },
          { name: 'value2', type: 'string', required: false, description: 'Value 2' },
          { name: 'value3', type: 'string', required: false, description: 'Value 3' }
        ],
        execute: async (params) => this.trigger(params.event, params.value1, params.value2, params.value3)
      }
    ];
  }

  async trigger(event: string, value1?: string, value2?: string, value3?: string): Promise<any> {
    const body: any = {};
    if (value1) body.value1 = value1;
    if (value2) body.value2 = value2;
    if (value3) body.value3 = value3;
    const response = await fetch(`https://maker.ifttt.com/trigger/${event}/with/key/${this.webhookKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { success: response.ok, message: await response.text() };
  }
}

// ============ Utilities - WolframAlpha ============

export class WolframAlphaIntegration extends BaseIntegration {
  private appId: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'wolfram', name: 'Wolfram Alpha', category: 'custom' });
    this.appId = this.getCredential('appId') || '';
  }

  async connect(): Promise<void> {
    if (!this.appId) throw new Error('WolframAlpha App ID required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'query',
        description: 'Ask WolframAlpha a question',
        params: [{ name: 'input', type: 'string', required: true, description: 'Query string' }],
        execute: async (params) => this.query(params.input)
      },
      {
        name: 'shortAnswer',
        description: 'Get a short text answer',
        params: [{ name: 'input', type: 'string', required: true, description: 'Query string' }],
        execute: async (params) => this.shortAnswer(params.input)
      }
    ];
  }

  async query(input: string): Promise<any> {
    const response = await fetch(`https://api.wolframalpha.com/v2/query?input=${encodeURIComponent(input)}&appid=${this.appId}&output=json`);
    return response.json();
  }

  async shortAnswer(input: string): Promise<any> {
    const response = await fetch(`https://api.wolframalpha.com/v1/result?i=${encodeURIComponent(input)}&appid=${this.appId}`);
    return { answer: await response.text() };
  }
}

// ============ Media - Giphy ============

export class GiphyIntegration extends BaseIntegration {
  private apiKey: string = '';
  private apiUrl = 'https://api.giphy.com/v1/gifs';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'giphy', name: 'Giphy', category: 'media' });
    this.apiKey = this.getCredential('apiKey') || '';
  }

  async connect(): Promise<void> {
    if (!this.apiKey) throw new Error('Giphy API key required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'search',
        description: 'Search for GIFs',
        params: [
          { name: 'query', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', required: false, description: 'Max results' }
        ],
        execute: async (params) => this.search(params.query, params.limit)
      },
      {
        name: 'trending',
        description: 'Get trending GIFs',
        params: [{ name: 'limit', type: 'number', required: false, description: 'Max results' }],
        execute: async (params) => this.trending(params.limit)
      },
      {
        name: 'random',
        description: 'Get a random GIF',
        params: [{ name: 'tag', type: 'string', required: false, description: 'Tag to filter by' }],
        execute: async (params) => this.random(params.tag)
      }
    ];
  }

  async search(query: string, limit: number = 10): Promise<any> {
    const response = await fetch(`${this.apiUrl}/search?api_key=${this.apiKey}&q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.json();
  }

  async trending(limit: number = 10): Promise<any> {
    const response = await fetch(`${this.apiUrl}/trending?api_key=${this.apiKey}&limit=${limit}`);
    return response.json();
  }

  async random(tag?: string): Promise<any> {
    let url = `${this.apiUrl}/random?api_key=${this.apiKey}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;
    const response = await fetch(url);
    return response.json();
  }
}

// ============ Developer - AWS S3 ============

export class AWSS3Integration extends BaseIntegration {
  private accessKeyId: string = '';
  private secretAccessKey: string = '';
  private region: string = '';
  private bucket: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'aws-s3', name: 'AWS S3', category: 'developer' });
    this.accessKeyId = this.getCredential('accessKeyId') || '';
    this.secretAccessKey = this.getCredential('secretAccessKey') || '';
    this.region = this.getSetting('region', 'us-east-1');
    this.bucket = this.getSetting('bucket', '');
  }

  async connect(): Promise<void> {
    if (!this.accessKeyId || !this.secretAccessKey) throw new Error('AWS credentials required');
    if (!this.bucket) throw new Error('S3 bucket name required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  private async signedFetch(method: string, path: string, body?: any): Promise<Response> {
    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com${path}`;
    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    // Simplified - in production use AWS SDK or proper SigV4
    return fetch(url, {
      method,
      headers: {
        'x-amz-date': dateStamp,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        Authorization: `AWS ${this.accessKeyId}:simplified`
      },
      body
    });
  }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'listObjects',
        description: 'List objects in the bucket',
        params: [
          { name: 'prefix', type: 'string', required: false, description: 'Key prefix filter' },
          { name: 'maxKeys', type: 'number', required: false, description: 'Max objects to list' }
        ],
        execute: async (params) => this.listObjects(params.prefix, params.maxKeys)
      },
      {
        name: 'getObject',
        description: 'Get an object from S3',
        params: [{ name: 'key', type: 'string', required: true, description: 'Object key' }],
        execute: async (params) => this.getObject(params.key)
      },
      {
        name: 'putObject',
        description: 'Upload an object to S3',
        params: [
          { name: 'key', type: 'string', required: true, description: 'Object key' },
          { name: 'content', type: 'string', required: true, description: 'Object content' },
          { name: 'contentType', type: 'string', required: false, description: 'Content type' }
        ],
        execute: async (params) => this.putObject(params.key, params.content, params.contentType)
      },
      {
        name: 'deleteObject',
        description: 'Delete an object from S3',
        params: [{ name: 'key', type: 'string', required: true, description: 'Object key' }],
        execute: async (params) => this.deleteObject(params.key)
      }
    ];
  }

  async listObjects(prefix?: string, maxKeys: number = 100): Promise<any> {
    let path = `/?list-type=2&max-keys=${maxKeys}`;
    if (prefix) path += `&prefix=${encodeURIComponent(prefix)}`;
    const response = await this.signedFetch('GET', path);
    return { success: response.ok, data: await response.text() };
  }

  async getObject(key: string): Promise<any> {
    const response = await this.signedFetch('GET', `/${encodeURIComponent(key)}`);
    return { success: response.ok, content: await response.text() };
  }

  async putObject(key: string, content: string, contentType?: string): Promise<any> {
    const response = await this.signedFetch('PUT', `/${encodeURIComponent(key)}`, content);
    return { success: response.ok };
  }

  async deleteObject(key: string): Promise<any> {
    const response = await this.signedFetch('DELETE', `/${encodeURIComponent(key)}`);
    return { success: response.ok };
  }
}

// ============ Productivity - Slack Webhooks ============

export class SlackWebhookIntegration extends BaseIntegration {
  private webhookUrl: string = '';

  constructor(config: IntegrationConfig) {
    super({ ...config, id: 'slack-webhook', name: 'Slack Webhook', category: 'communication' });
    this.webhookUrl = this.getCredential('webhookUrl') || '';
  }

  async connect(): Promise<void> {
    if (!this.webhookUrl) throw new Error('Slack webhook URL required');
    this.connected = true;
  }

  async disconnect(): Promise<void> { this.connected = false; }

  getActions(): IntegrationAction[] {
    return [
      {
        name: 'sendMessage',
        description: 'Send a message to Slack via webhook',
        params: [
          { name: 'text', type: 'string', required: true, description: 'Message text' },
          { name: 'username', type: 'string', required: false, description: 'Bot username' },
          { name: 'iconEmoji', type: 'string', required: false, description: 'Bot icon emoji' }
        ],
        execute: async (params) => this.sendMessage(params.text, params.username, params.iconEmoji)
      },
      {
        name: 'sendRichMessage',
        description: 'Send a rich message with blocks',
        params: [
          { name: 'text', type: 'string', required: true, description: 'Fallback text' },
          { name: 'blocks', type: 'array', required: true, description: 'Slack Block Kit blocks' }
        ],
        execute: async (params) => this.sendRichMessage(params.text, params.blocks)
      }
    ];
  }

  async sendMessage(text: string, username?: string, iconEmoji?: string): Promise<any> {
    const body: any = { text };
    if (username) body.username = username;
    if (iconEmoji) body.icon_emoji = iconEmoji;
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { success: response.ok };
  }

  async sendRichMessage(text: string, blocks: any[]): Promise<any> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, blocks })
    });
    return { success: response.ok };
  }
}

// ============ Integration Registry ============

export class IntegrationRegistry {
  private integrations: Map<string, BaseIntegration> = new Map();
  private factories: Map<string, (config: IntegrationConfig) => BaseIntegration> = new Map();

  constructor() {
    // Register all built-in integrations (20 total)
    // Productivity
    this.registerFactory('notion', (c) => new NotionIntegration(c));
    this.registerFactory('google-calendar', (c) => new GoogleCalendarIntegration(c));
    this.registerFactory('gmail', (c) => new GmailIntegration(c));
    this.registerFactory('todoist', (c) => new TodoistIntegration(c));
    this.registerFactory('trello', (c) => new TrelloIntegration(c));
    // Media
    this.registerFactory('spotify', (c) => new SpotifyIntegration(c));
    this.registerFactory('youtube', (c) => new YouTubeIntegration(c));
    this.registerFactory('giphy', (c) => new GiphyIntegration(c));
    // Smart Home
    this.registerFactory('hue', (c) => new HueIntegration(c));
    this.registerFactory('home-assistant', (c) => new HomeAssistantIntegration(c));
    // Developer
    this.registerFactory('github', (c) => new GitHubIntegration(c));
    this.registerFactory('linear', (c) => new LinearIntegration(c));
    this.registerFactory('jira', (c) => new JiraIntegration(c));
    this.registerFactory('vercel', (c) => new VercelIntegration(c));
    this.registerFactory('stripe', (c) => new StripeIntegration(c));
    this.registerFactory('aws-s3', (c) => new AWSS3Integration(c));
    // Communication
    this.registerFactory('twilio', (c) => new TwilioIntegration(c));
    this.registerFactory('twitter', (c) => new TwitterIntegration(c));
    this.registerFactory('sendgrid', (c) => new SendGridIntegration(c));
    this.registerFactory('slack-webhook', (c) => new SlackWebhookIntegration(c));
    // Utilities
    this.registerFactory('weather', (c) => new WeatherIntegration(c));
    this.registerFactory('ifttt', (c) => new IFTTTIntegration(c));
    this.registerFactory('wolfram', (c) => new WolframAlphaIntegration(c));
  }

  registerFactory(id: string, factory: (config: IntegrationConfig) => BaseIntegration): void {
    this.factories.set(id, factory);
  }

  async createAndConnect(config: IntegrationConfig): Promise<BaseIntegration> {
    const factory = this.factories.get(config.id);
    if (!factory) {
      throw new Error(`Unknown integration: ${config.id}`);
    }

    const integration = factory(config);
    await integration.connect();
    this.integrations.set(config.id, integration);
    return integration;
  }

  get(id: string): BaseIntegration | undefined {
    return this.integrations.get(id);
  }

  getAll(): BaseIntegration[] {
    return Array.from(this.integrations.values());
  }

  getByCategory(category: IntegrationCategory): BaseIntegration[] {
    return this.getAll().filter(i => i.category === category);
  }

  async disconnect(id: string): Promise<void> {
    const integration = this.integrations.get(id);
    if (integration) {
      await integration.disconnect();
      this.integrations.delete(id);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const integration of this.integrations.values()) {
      await integration.disconnect();
    }
    this.integrations.clear();
  }

  /**
   * Connect an integration by ID (uses default config)
   * Called from MatrixMode init for auto-connect
   */
  async connect(id: string, config?: Partial<IntegrationConfig>): Promise<BaseIntegration> {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Unknown integration: ${id}`);
    }

    const fullConfig: IntegrationConfig = {
      id,
      name: id,
      category: 'custom',
      enabled: true,
      ...config
    };

    const integration = factory(fullConfig);
    await integration.connect();
    this.integrations.set(id, integration);
    return integration;
  }

  getAvailableIntegrations(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get integration count
   */
  getIntegrationCount(): { available: number; connected: number } {
    return {
      available: this.factories.size,
      connected: this.integrations.size
    };
  }

  /**
   * Execute an action on a connected integration
   */
  async executeAction(integrationId: string, actionName: string, params: Record<string, any>): Promise<any> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration not connected: ${integrationId}`);
    }

    const actions = integration.getActions();
    const action = actions.find(a => a.name === actionName);
    if (!action) {
      throw new Error(`Unknown action: ${actionName} on ${integrationId}`);
    }

    return action.execute(params);
  }

  /**
   * List all available actions across all connected integrations
   */
  listAllActions(): Array<{ integrationId: string; integrationName: string; actions: IntegrationAction[] }> {
    return Array.from(this.integrations.entries()).map(([id, integration]) => ({
      integrationId: id,
      integrationName: integration.name,
      actions: integration.getActions()
    }));
  }
}

// Singleton
let integrationRegistryInstance: IntegrationRegistry | null = null;

export function getIntegrationRegistry(): IntegrationRegistry {
  if (!integrationRegistryInstance) {
    integrationRegistryInstance = new IntegrationRegistry();
  }
  return integrationRegistryInstance;
}

export default IntegrationRegistry;
