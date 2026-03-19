import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Diamant } from '../src/index.js';
import type { Table } from '../src/index.js';

describe('Lookup, Rollup, and Count columns', () => {
  let db: Diamant;
  let base: ReturnType<Diamant['createBase']>;
  let orders: Table;
  let products: Table;
  let linkColId: string;
  let productNameColId: string;
  let productPriceColId: string;

  beforeEach(() => {
    db = new Diamant(':memory:');
    base = db.createBase('Shop');
    orders = base.createTable('Orders');
    products = base.createTable('Products');

    orders.addColumn({ name: 'OrderName', type: 'text' });
    productNameColId = products.addColumn({ name: 'ProductName', type: 'text' }).id;
    productPriceColId = products.addColumn({ name: 'Price', type: 'number' }).id;

    linkColId = orders.addColumn({
      name: 'Items',
      type: 'link',
      config: { linkedTableId: products.id, relationship: 'many-to-many' },
    }).id;
  });

  afterEach(() => {
    db.close();
  });

  describe('lookup column', () => {
    it('should resolve lookup values from linked rows', () => {
      orders.addColumn({
        name: 'ItemNames',
        type: 'lookup',
        config: { linkColumnId: linkColId, lookupColumnId: productNameColId },
      });

      const p1 = products.addRow({ ProductName: 'Widget', Price: 10 });
      const p2 = products.addRow({ ProductName: 'Gadget', Price: 20 });
      const order = orders.addRow({ OrderName: 'Order 1', Items: [p1.id, p2.id] });

      const fetched = orders.getRow(order.id);
      // Order is not guaranteed by SQL IN clause
      expect(fetched.cells.ItemNames).toEqual(expect.arrayContaining(['Widget', 'Gadget']));
      expect((fetched.cells.ItemNames as unknown[]).length).toBe(2);
    });

    it('should return empty array when no links', () => {
      orders.addColumn({
        name: 'ItemNames',
        type: 'lookup',
        config: { linkColumnId: linkColId, lookupColumnId: productNameColId },
      });

      const order = orders.addRow({ OrderName: 'Empty Order' });
      const fetched = orders.getRow(order.id);
      expect(fetched.cells.ItemNames).toEqual([]);
    });

    it('should look up numeric values', () => {
      orders.addColumn({
        name: 'ItemPrices',
        type: 'lookup',
        config: { linkColumnId: linkColId, lookupColumnId: productPriceColId },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 15 });
      const p2 = products.addRow({ ProductName: 'B', Price: 25 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      const fetched = orders.getRow(order.id);
      // Order is not guaranteed by SQL IN clause
      expect(fetched.cells.ItemPrices).toEqual(expect.arrayContaining([15, 25]));
      expect((fetched.cells.ItemPrices as unknown[]).length).toBe(2);
    });
  });

  describe('rollup column', () => {
    it('should compute sum', () => {
      orders.addColumn({
        name: 'TotalPrice',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'sum',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 10 });
      const p2 = products.addRow({ ProductName: 'B', Price: 20 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      expect(orders.getRow(order.id).cells.TotalPrice).toBe(30);
    });

    it('should compute avg', () => {
      orders.addColumn({
        name: 'AvgPrice',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'avg',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 10 });
      const p2 = products.addRow({ ProductName: 'B', Price: 30 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      expect(orders.getRow(order.id).cells.AvgPrice).toBe(20);
    });

    it('should compute min', () => {
      orders.addColumn({
        name: 'MinPrice',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'min',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 5 });
      const p2 = products.addRow({ ProductName: 'B', Price: 15 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      expect(orders.getRow(order.id).cells.MinPrice).toBe(5);
    });

    it('should compute max', () => {
      orders.addColumn({
        name: 'MaxPrice',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'max',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 5 });
      const p2 = products.addRow({ ProductName: 'B', Price: 15 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      expect(orders.getRow(order.id).cells.MaxPrice).toBe(15);
    });

    it('should compute count', () => {
      orders.addColumn({
        name: 'ItemCount',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'count',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 5 });
      const p2 = products.addRow({ ProductName: 'B', Price: 15 });
      const p3 = products.addRow({ ProductName: 'C', Price: 25 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id, p3.id] });

      expect(orders.getRow(order.id).cells.ItemCount).toBe(3);
    });

    it('should compute arrayJoin', () => {
      orders.addColumn({
        name: 'Names',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productNameColId,
          aggregation: 'arrayJoin',
        },
      });

      const p1 = products.addRow({ ProductName: 'Widget', Price: 5 });
      const p2 = products.addRow({ ProductName: 'Gadget', Price: 15 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      const names = orders.getRow(order.id).cells.Names as string;
      // Order is not guaranteed, so check both are present
      expect(names).toContain('Widget');
      expect(names).toContain('Gadget');
    });

    it('should compute arrayUnique', () => {
      orders.addColumn({
        name: 'UniquePrices',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'arrayUnique',
        },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 10 });
      const p2 = products.addRow({ ProductName: 'B', Price: 10 });
      const p3 = products.addRow({ ProductName: 'C', Price: 20 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id, p3.id] });

      const result = orders.getRow(order.id).cells.UniquePrices as number[];
      expect(result).toHaveLength(2);
      expect(result).toContain(10);
      expect(result).toContain(20);
    });

    it('should compute arrayCompact (filter nulls)', () => {
      orders.addColumn({
        name: 'CompactNames',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productNameColId,
          aggregation: 'arrayCompact',
        },
      });

      const p1 = products.addRow({ ProductName: 'Widget', Price: 5 });
      const p2 = products.addRow({ Price: 10 }); // no name
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      const result = orders.getRow(order.id).cells.CompactNames as unknown[];
      expect(result).toContain('Widget');
      // null should have been filtered out
      expect(result.every((v) => v !== null && v !== undefined && v !== '')).toBe(true);
    });

    it('should return 0 for sum with empty links', () => {
      orders.addColumn({
        name: 'Total',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'sum',
        },
      });

      const order = orders.addRow({ OrderName: 'Empty' });
      expect(orders.getRow(order.id).cells.Total).toBe(0);
    });

    it('should return null for min/max with empty links', () => {
      orders.addColumn({
        name: 'MinP',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'min',
        },
      });
      orders.addColumn({
        name: 'MaxP',
        type: 'rollup',
        config: {
          linkColumnId: linkColId,
          lookupColumnId: productPriceColId,
          aggregation: 'max',
        },
      });

      const order = orders.addRow({ OrderName: 'Empty' });
      const fetched = orders.getRow(order.id);
      expect(fetched.cells.MinP).toBeNull();
      expect(fetched.cells.MaxP).toBeNull();
    });
  });

  describe('count column', () => {
    it('should count linked rows', () => {
      orders.addColumn({
        name: 'NumItems',
        type: 'count',
        config: { linkColumnId: linkColId },
      });

      const p1 = products.addRow({ ProductName: 'A', Price: 5 });
      const p2 = products.addRow({ ProductName: 'B', Price: 15 });
      const order = orders.addRow({ OrderName: 'O', Items: [p1.id, p2.id] });

      expect(orders.getRow(order.id).cells.NumItems).toBe(2);
    });

    it('should return 0 when no links', () => {
      orders.addColumn({
        name: 'NumItems',
        type: 'count',
        config: { linkColumnId: linkColId },
      });

      const order = orders.addRow({ OrderName: 'Empty' });
      expect(orders.getRow(order.id).cells.NumItems).toBe(0);
    });
  });
});
