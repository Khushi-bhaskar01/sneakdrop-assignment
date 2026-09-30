export type UserRow = {
  id: string;
  email: string;
  created_at: string;
};

export type InventoryRow = {
  id: number;
  sneaker_pair_id: number;
  available_stock: number;
  updated_at: string;
};

export type HoldRow = {
  id: string;
  user_id: string;
  sneaker_pair_id: number;
  status: 'ACTIVE' | 'EXPIRED' | 'PURCHASED' | 'RELEASED';
  expires_at: string;
  created_at: string;
};
