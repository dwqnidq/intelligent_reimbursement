import { buildDepartmentTree } from './department-tree.util';

describe('buildDepartmentTree', () => {
  it('nests children when parent_id is a plain string id', () => {
    const root = { _id: 'root1', name: '总部', parent_id: null };
    const child = { _id: 'child1', name: '研发部', parent_id: 'root1' };

    const tree = buildDepartmentTree([root, child]);

    expect(tree).toHaveLength(1);
    expect(tree[0]._id).toBe('root1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children?.[0]._id).toBe('child1');
  });

  it('nests children when parent_id is populated as an object', () => {
    const root = {
      _id: 'root1',
      name: '总部',
      parent_id: null,
      toObject() {
        return { _id: this._id, name: this.name, parent_id: this.parent_id };
      },
    };
    const child = {
      _id: 'child1',
      name: '研发部',
      parent_id: { _id: 'root1', name: '总部', code: 'HQ' },
      toObject() {
        return { _id: this._id, name: this.name, parent_id: this.parent_id };
      },
    };

    const tree = buildDepartmentTree([root, child]);

    expect(tree).toHaveLength(1);
    expect(tree[0]._id).toBe('root1');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children?.[0]._id).toBe('child1');
    expect(tree[0].children?.[0].parent_id).toEqual({
      _id: 'root1',
      name: '总部',
      code: 'HQ',
    });
  });

  it('supports multi-level nesting with populated parent_id', () => {
    const root = { _id: 'r', name: '总部', parent_id: null };
    const mid = {
      _id: 'm',
      name: '技术中心',
      parent_id: { _id: 'r', name: '总部' },
    };
    const leaf = {
      _id: 'l',
      name: '前端组',
      parent_id: { _id: 'm', name: '技术中心' },
    };

    const tree = buildDepartmentTree([root, mid, leaf]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children?.[0]._id).toBe('m');
    expect(tree[0].children?.[0].children?.[0]._id).toBe('l');
  });
});
