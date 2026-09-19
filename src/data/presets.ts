import { PresetApiTemplate } from '../types';

export const PRESET_TEMPLATES: PresetApiTemplate[] = [
  {
    name: 'DummyJSON Products',
    category: 'E-Commerce',
    description: 'Fetch 30 products with title, price, discount, rating, stock, brand and category',
    url: 'https://dummyjson.com/products?limit=30',
    method: 'GET',
    dataPath: 'products',
    targetTable: 'products',
    primaryKey: 'id',
  },
  {
    name: 'DummyJSON Users',
    category: 'User Accounts',
    description: 'Fetch user records with names, email, phone, age, role, company and address',
    url: 'https://dummyjson.com/users?limit=30',
    method: 'GET',
    dataPath: 'users',
    targetTable: 'users',
    primaryKey: 'id',
  },
  {
    name: 'JSONPlaceholder Posts',
    category: 'Blog / Content',
    description: 'Fetch standard blog posts with userId, id, title, and body content',
    url: 'https://jsonplaceholder.typicode.com/posts',
    method: 'GET',
    dataPath: '',
    targetTable: 'api_posts',
    primaryKey: 'id',
  },
  {
    name: 'CoinGecko Crypto Markets',
    category: 'Fintech / Crypto',
    description: 'Fetch top live cryptocurrency market prices, market cap, and 24h changes',
    url: 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=25&page=1',
    method: 'GET',
    dataPath: '',
    targetTable: 'crypto_prices',
    primaryKey: 'id',
  },
  {
    name: 'GitHub Public Events',
    category: 'Developer APIs',
    description: 'Fetch latest global GitHub public activity events and commit payloads',
    url: 'https://api.github.com/events?per_page=25',
    method: 'GET',
    dataPath: '',
    targetTable: 'github_events',
    primaryKey: 'id',
    headers: [
      { key: 'User-Agent', value: 'API-To-Postgres-Ingestor', enabled: true }
    ]
  },
  {
    name: 'Fake Store API Products',
    category: 'E-Commerce',
    description: 'Fetch retail merchandise items with rating metrics and image URLs',
    url: 'https://fakestoreapi.com/products',
    method: 'GET',
    dataPath: '',
    targetTable: 'store_inventory',
    primaryKey: 'id',
  }
];
