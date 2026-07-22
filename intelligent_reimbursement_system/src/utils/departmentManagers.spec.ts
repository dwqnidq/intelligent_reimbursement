import { describe, expect, it } from "vitest";
import { collectDepartmentManagers } from "./departmentManagers";
import type { Department } from "../api/department";

describe("collectDepartmentManagers", () => {
  it("仅收集启用部门负责人，同人多部门合并部门名", () => {
    const depts: Department[] = [
      {
        _id: "d1",
        name: "研发",
        code: "rd",
        status: 1,
        sort: 0,
        manager_id: {
          _id: "m1",
          name: "张三",
          avatar: "a.png",
          position: "总监",
        },
      },
      {
        _id: "d2",
        name: "产品",
        code: "pm",
        status: 1,
        sort: 1,
        manager_id: {
          _id: "m1",
          name: "张三",
          avatar: "a.png",
          position: "总监",
        },
      },
      {
        _id: "d3",
        name: "停用部",
        code: "off",
        status: 0,
        sort: 2,
        manager_id: {
          _id: "m2",
          name: "李四",
          avatar: "",
          position: "",
        },
      },
      {
        _id: "d4",
        name: "市场",
        code: "mkt",
        status: 1,
        sort: 3,
        manager_id: {
          _id: "m3",
          name: "王五",
          avatar: "",
          position: "经理",
        },
      },
    ];

    const list = collectDepartmentManagers(depts);
    expect(list).toEqual([
      {
        _id: "m1",
        name: "张三",
        avatar: "a.png",
        position: "总监",
        deptNames: "研发、产品",
      },
      {
        _id: "m3",
        name: "王五",
        avatar: "",
        position: "经理",
        deptNames: "市场",
      },
    ]);
  });

  it("支持树形部门并按姓名过滤", () => {
    const tree: Department[] = [
      {
        _id: "p",
        name: "总部",
        code: "hq",
        status: 1,
        sort: 0,
        manager_id: {
          _id: "m1",
          name: "总部负责人",
          avatar: "",
          position: "",
        },
        children: [
          {
            _id: "c",
            name: "分部",
            code: "sub",
            status: 1,
            sort: 0,
            manager_id: {
              _id: "m2",
              name: "分部负责人",
              avatar: "",
              position: "",
            },
          },
        ],
      },
    ];
    expect(collectDepartmentManagers(tree, "分部")).toEqual([
      {
        _id: "m2",
        name: "分部负责人",
        avatar: "",
        position: "",
        deptNames: "分部",
      },
    ]);
  });
});
