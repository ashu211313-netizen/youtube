import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { appendImages, createDatabase } from "./fixtures/idea-images-db.mjs";

const { harness } = createRequire(import.meta.url)("./fixtures/app-harness.cjs");
const cardIds = h => [...h.node("ideaBoard").innerHTML.matchAll(/data-idea-card-id="([^"]+)"/g)].map(match => match[1]);

test("idea board uses absolute child activity, ignores parent edits, and keeps creation labels and child order", () => {
  const h = harness();
  h.run(`
    data.ideas = [
      mapIdea({id:"new", title:"神レース", status:"実行済み", created_at:"2026-11-02T00:00:00Z", updated_at:"2026-12-01T00:00:00Z"}),
      mapIdea({id:"old", title:"疑問解決系", status:"実行済み", created_at:"2026-08-01T00:00:00Z"}),
      mapIdea({id:"offset", title:"別の企画", status:"実行済み", created_at:"2026-09-01T00:00:00Z"}),
      mapIdea({id:"draft", title:"下書き", status:"アイデア", created_at:"2026-07-01T00:00:00Z"})
    ];
    data.ideaItems = [
      mapIdeaItem({id:1, parent_idea_id:"old", created_at:"2026-08-03T00:00:00Z", updated_at:"2026-11-04T08:00:00Z"}),
      mapIdeaItem({id:2, parent_idea_id:"old", created_at:"2026-08-04T00:00:00Z", updated_at:null}),
      mapIdeaItem({id:3, parent_idea_id:"offset", created_at:"2026-09-02T00:00:00Z", updated_at:"2026-11-04T16:00:00+09:00"}),
      mapIdeaItem({id:4, parent_idea_id:"missing", created_at:"2026-12-01T00:00:00Z"})
    ];
    renderIdeas();
  `);
  assert.deepEqual(cardIds(h), ["draft", "old", "offset", "new"]);
  assert.match(h.node("ideaBoard").innerHTML, /疑問解決系<\/strong>[\s\S]*?追加 2026年8月1日/);
  assert.deepEqual(Array.from(h.run('getIdeaItems("old").map(item=>item.id)')), [2, 1]);
  assert.deepEqual(Array.from(h.run("data.ideas.map(idea=>idea.id)")), ["new", "old", "offset", "draft"]);
});

test("idea board falls back from invalid timestamps and uses deterministic creation/id tiebreaks", () => {
  const h = harness();
  h.run(`
    data.ideas = [
      {id:"1",title:"先",status:"実行済み",createdAt:"2026-09-01T00:00:00Z"},
      {id:"2",title:"同日",status:"実行済み",createdAt:"2026-09-01T00:00:00Z"},
      {id:"3",title:"不明",status:"実行済み",createdAt:"not-a-date"},
      {id:"4",title:"古い",status:"実行済み",createdAt:"2026-08-01T00:00:00Z"}
    ];
    data.ideaItems = [{id:1,parentIdeaId:4,createdAt:"2026-11-04T00:00:00Z",updatedAt:"invalid"}];
    renderIdeas();
  `);
  assert.deepEqual(cardIds(h), ["4", "2", "1", "3"]);
  h.run("data.ideas.reverse();renderIdeas()");
  assert.deepEqual(cardIds(h), ["4", "2", "1", "3"]);
  h.run("data.ideaItems=[];renderIdeas()");
  assert.deepEqual(cardIds(h), ["2", "1", "4", "3"]);
});

test("real add/edit/status paths reorder from persisted child timestamps after a fresh reload", async () => {
  const db = await createDatabase();
  const old = "80000000-0000-4000-8000-000000000001";
  const newer = "80000000-0000-4000-8000-000000000002";
  try {
    await db.query(`insert into public.ideas(id,title,status,created_at,updated_at) values
      ($1,'疑問解決系','実行済み','2020-08-01T00:00:00Z',clock_timestamp()),
      ($2,'神レース','実行済み','2020-11-01T00:00:00Z','2020-11-01T00:00:00Z')`, [old, newer]);
    const { rows: [olderChild] } = await db.query(`insert into public.idea_items(parent_idea_id,title,created_at,updated_at)
      values($1,'先に保存したアイデア','2020-11-02T00:00:00Z','2020-11-02T00:00:00Z') returning id`, [newer]);
    const readParents = () => db.query("select * from public.ideas order by id").then(result => result.rows);
    const parentsBefore = await readParents();
    const writes = [];
    const activityLogs = [];
    let denyStatusUpdate = false;
    const client = {
      async rpc(name, values) {
        assert.equal(name, "save_idea_with_images");
        assert.equal(values.p_kind, "idea_item");
        writes.push(values.p_id === null ? "add" : "edit");
        const data = await appendImages(db, values.p_kind, values.p_id, values.p_values,
          values.p_added_image_urls, values.p_removed_image_urls, values.p_expected_image_urls, values.p_expected_updated_at);
        return { data, error: null };
      },
      from(table) {
        let id, payload, single = false;
        const q = {
          select() { return q; },
          order() { return q; },
          is() { return q; },
          limit() { return q; },
          maybeSingle() { single = true; return q; },
          insert(value) { assert.equal(table, "activity_logs"); activityLogs.push(value); return q; },
          update(value) { assert.equal(table, "idea_items"); payload = value; return q; },
          eq(key, value) { if (key === "id") id = value; return q; },
          then(resolve, reject) {
            return (async () => {
              if (payload) {
                if (denyStatusUpdate) return { data: null, error: { message: "fixture refused status update" } };
                const { rows } = await db.query("update public.idea_items set status=$1,updated_at=$2 where id=$3 returning id", [payload.status, payload.updated_at, id]);
                if (rows.length) writes.push("status");
                return { data: single ? rows[0] ?? null : null, error: null };
              }
              if (table === "ideas" || table === "idea_items") {
                const { rows } = await db.query(`select * from public.${table} order by created_at desc,id desc`);
                return { data: JSON.parse(JSON.stringify(rows)), error: null };
              }
              return { data: single ? null : [], error: null };
            })().then(resolve, reject);
          }
        };
        return q;
      }
    };
    const fresh = async () => {
      const h = harness({ client });
      h.run('authenticatedUserId = "local-qa"');
      assert.equal(await h.run("loadAllData({silent:true})"), true, JSON.stringify(h.logs));
      return h;
    };
    const bindForm = (h, updatedAt = null) => {
      const editor = { dataset: { imageInitial: JSON.stringify({ urls: [], updatedAt }) } };
      h.context.button = {
        dataset: {},
        closest: () => ({ querySelector: () => editor, reset() {} })
      };
    };
    let h = await fresh();
    assert.deepEqual(cardIds(h), [newer, old]);

    bindForm(h);
    await h.run(`addIdeaItem("${old}",{title:"新しい中身"},button)`);
    assert.deepEqual(cardIds(h), [old, newer]);
    const { rows: [newChild] } = await db.query("select * from public.idea_items where parent_idea_id=$1", [old]);
    assert.equal(newChild.title, "新しい中身");
    h = await fresh();
    assert.deepEqual(cardIds(h), [old, newer]);
    assert.match(h.node("ideaBoard").innerHTML, /追加 2020年8月1日/);

    // Create a clear activity gap so the test does not depend on same-ms clock resolution.
    await db.query("update public.idea_items set created_at=clock_timestamp()-interval '1 day',updated_at=clock_timestamp()-interval '1 day' where id=$1", [newChild.id]);
    h = await fresh();
    const item = h.run(`getIdeaItemById(${olderChild.id})`);
    bindForm(h, item.updatedAt);
    await h.run(`updateIdeaItem(${olderChild.id},{title:"編集済み",note:"変更",status:"アイデア"},button)`);
    assert.deepEqual(cardIds(h), [newer, old]);
    h = await fresh();
    assert.deepEqual(cardIds(h), [newer, old]);
    assert.equal(h.run(`getIdeaItemById(${olderChild.id}).note`), "変更");

    await db.query("update public.idea_items set updated_at=clock_timestamp()-interval '1 hour' where id=$1", [olderChild.id]);
    h = await fresh();
    assert.deepEqual(cardIds(h), [newer, old]);
    denyStatusUpdate = true;
    await h.run(`updateIdeaItemStatus(${newChild.id},"実行済み")`);
    assert.deepEqual(cardIds(h), [newer, old]);
    assert.equal(h.run(`getIdeaItemById(${newChild.id}).status`), "アイデア");
    denyStatusUpdate = false;
    const { rows: [{ bound: beforeStatus }] } = await db.query("select clock_timestamp()::text as bound");
    h.context.Date = class SkewedBrowserDate extends Date {
      constructor(...args) { super(...(args.length ? args : ["2040-01-01T00:00:00Z"])); }
    };
    try {
      await h.run(`updateIdeaItemStatus(${newChild.id},"実行済み")`);
    } finally {
      h.context.Date = Date;
    }
    const { rows: [{ database_time: usedDatabaseTime }] } = await db.query(
      "select updated_at between $2::timestamptz and clock_timestamp() as database_time from public.idea_items where id=$1",
      [newChild.id, beforeStatus]
    );
    assert.equal(usedDatabaseTime, true, "a skewed client clock cannot pin the parent above later database activity");
    assert.deepEqual(cardIds(h), [old, newer]);
    h = await fresh();
    assert.deepEqual(cardIds(h), [old, newer]);
    assert.equal(h.run(`getIdeaItemById(${newChild.id}).status`), "実行済み");
    assert.deepEqual(writes, ["add", "edit", "status"]);

    // Another user may delete a child while this tab still shows its status control.
    const { rows: [staleChild] } = await db.query(`insert into public.idea_items(parent_idea_id,title,created_at,updated_at)
      values($1,'別の利用者が削除するアイデア','2020-11-03T00:00:00Z','2020-11-03T00:00:00Z') returning id`, [newer]);
    h = await fresh();
    assert.ok(h.run(`getIdeaItemById(${staleChild.id})`));
    await db.query("delete from public.idea_items where id=$1", [staleChild.id]);
    const beforeLogs = activityLogs.length;
    h.run('globalThis.staleStatusControl = {value:"実行済み", disabled:false, isConnected:true}');
    await h.run(`updateIdeaItemStatus(${staleChild.id},"実行済み",staleStatusControl)`);
    assert.equal(h.run(`getIdeaItemById(${staleChild.id})`), null, "refresh removes the stale control");
    assert.deepEqual(cardIds(h), [old, newer]);
    assert.equal(activityLogs.length, beforeLogs, "a zero-row update does not write a success log");
    assert.match(h.node("toast").textContent, /変更できませんでした/);
    assert.equal(h.run("staleStatusControl.value"), "アイデア");
    assert.equal(h.run("staleStatusControl.disabled"), false);
    assert.deepEqual(writes, ["add", "edit", "status"]);
    assert.deepEqual(await readParents(), parentsBefore);
  } finally {
    await db.close();
  }
});
