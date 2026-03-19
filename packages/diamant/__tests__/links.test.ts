import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Diamant } from '../src/index.js';
import type { Table } from '../src/index.js';

describe('Link columns', () => {
  let db: Diamant;
  let base: ReturnType<Diamant['createBase']>;
  let authors: Table;
  let books: Table;

  beforeEach(() => {
    db = new Diamant(':memory:');
    base = db.createBase('Library');
    authors = base.createTable('Authors');
    books = base.createTable('Books');

    authors.addColumn({ name: 'Name', type: 'text' });
    books.addColumn({ name: 'Title', type: 'text' });
  });

  afterEach(() => {
    db.close();
  });

  describe('symmetric column creation', () => {
    it('should create a symmetric column in the linked table', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const authorCols = authors.listColumns();
      const symCol = authorCols.find((c) => c.type === 'link');
      expect(symCol).toBeDefined();
      expect(symCol!.name).toBe('Books'); // named after the source table
      expect((symCol!.config as any).linkedTableId).toBe(books.id);
    });

    it('should reference each other in symmetricColumnId', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const bookLinkCol = books.listColumns().find((c) => c.type === 'link')!;
      const authorSymCol = authors.listColumns().find((c) => c.type === 'link')!;

      expect((bookLinkCol.config as any).symmetricColumnId).toBe(authorSymCol.id);
      expect((authorSymCol.config as any).symmetricColumnId).toBe(bookLinkCol.id);
    });
  });

  describe('adding rows with links', () => {
    it('should create links and sync symmetric side', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const author1 = authors.addRow({ Name: 'Tolkien' });
      const author2 = authors.addRow({ Name: 'Lewis' });
      const book = books.addRow({ Title: 'The Hobbit', Author: [author1.id] });

      // Book should link to author
      const fetchedBook = books.getRow(book.id);
      expect(fetchedBook.cells.Author).toEqual([author1.id]);

      // Symmetric side: author should link back to book
      const fetchedAuthor = authors.getRow(author1.id);
      const symColName = authors.listColumns().find((c) => c.type === 'link')!.name;
      expect(fetchedAuthor.cells[symColName]).toEqual([book.id]);

      // Author2 should have no links
      const fetchedAuthor2 = authors.getRow(author2.id);
      expect(fetchedAuthor2.cells[symColName]).toBeNull();
    });

    it('should support many-to-many links', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const a1 = authors.addRow({ Name: 'Author A' });
      const a2 = authors.addRow({ Name: 'Author B' });
      books.addRow({ Title: 'Book 1', Author: [a1.id, a2.id] });

      const symColName = authors.listColumns().find((c) => c.type === 'link')!.name;

      const fetchedA1 = authors.getRow(a1.id);
      const fetchedA2 = authors.getRow(a2.id);
      expect((fetchedA1.cells[symColName] as string[])).toHaveLength(1);
      expect((fetchedA2.cells[symColName] as string[])).toHaveLength(1);
    });
  });

  describe('updating links', () => {
    it('should sync changes on link update', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const a1 = authors.addRow({ Name: 'Author A' });
      const a2 = authors.addRow({ Name: 'Author B' });
      const book = books.addRow({ Title: 'Book', Author: [a1.id] });

      const symColName = authors.listColumns().find((c) => c.type === 'link')!.name;

      // Verify initial state
      expect(authors.getRow(a1.id).cells[symColName]).toEqual([book.id]);

      // Update: replace a1 with a2
      books.updateRow(book.id, { Author: [a2.id] });

      // a1 should no longer link to book
      expect(authors.getRow(a1.id).cells[symColName]).toEqual([]);
      // a2 should now link to book
      expect(authors.getRow(a2.id).cells[symColName]).toEqual([book.id]);
    });

    it('should handle adding additional links', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const a1 = authors.addRow({ Name: 'Author A' });
      const a2 = authors.addRow({ Name: 'Author B' });
      const book = books.addRow({ Title: 'Book', Author: [a1.id] });

      // Add a2 to the link
      books.updateRow(book.id, { Author: [a1.id, a2.id] });

      const symColName = authors.listColumns().find((c) => c.type === 'link')!.name;
      expect(authors.getRow(a1.id).cells[symColName]).toEqual([book.id]);
      expect(authors.getRow(a2.id).cells[symColName]).toEqual([book.id]);
    });
  });

  describe('deleting a row with links', () => {
    it('should remove the row from linked rows symmetric columns', () => {
      books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      const a1 = authors.addRow({ Name: 'Author A' });
      const book = books.addRow({ Title: 'Book', Author: [a1.id] });

      const symColName = authors.listColumns().find((c) => c.type === 'link')!.name;
      expect(authors.getRow(a1.id).cells[symColName]).toEqual([book.id]);

      // Delete the book
      books.deleteRow(book.id);

      // Symmetric link should be cleaned up
      const fetchedA1 = authors.getRow(a1.id);
      expect(fetchedA1.cells[symColName]).toEqual([]);
    });
  });

  describe('deleting a link column', () => {
    it('should delete the symmetric column', () => {
      const linkCol = books.addColumn({
        name: 'Author',
        type: 'link',
        config: { linkedTableId: authors.id, relationship: 'many-to-many' },
      });

      // Verify symmetric column exists
      expect(authors.listColumns().some((c) => c.type === 'link')).toBe(true);

      books.deleteColumn(linkCol.id);

      // Symmetric column should be gone
      expect(authors.listColumns().some((c) => c.type === 'link')).toBe(false);
      // Original link column should be gone
      expect(books.listColumns().some((c) => c.type === 'link')).toBe(false);
    });
  });

  describe('self-linking', () => {
    it('should allow a table to link to itself', () => {
      const people = base.createTable('People');
      people.addColumn({ name: 'Name', type: 'text' });
      people.addColumn({
        name: 'Friends',
        type: 'link',
        config: { linkedTableId: people.id, relationship: 'many-to-many' },
      });

      const alice = people.addRow({ Name: 'Alice' });
      const bob = people.addRow({ Name: 'Bob' });

      // Link Alice -> Bob
      people.updateRow(alice.id, { Friends: [bob.id] });

      const cols = people.listColumns();
      const friendsCol = cols.find((c) => c.name === 'Friends')!;
      const symCol = cols.find((c) => c.type === 'link' && c.id !== friendsCol.id)!;

      // Alice's Friends should contain Bob
      const fetchedAlice = people.getRow(alice.id);
      expect(fetchedAlice.cells.Friends).toEqual([bob.id]);

      // Bob's symmetric column should contain Alice
      const fetchedBob = people.getRow(bob.id);
      expect(fetchedBob.cells[symCol.name]).toEqual([alice.id]);
    });
  });
});
