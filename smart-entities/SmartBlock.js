import { SmartEntity } from "./SmartEntity.js";

export class SmartBlock extends SmartEntity {
  static get defaults() {
    return {
      data: {
        text: null,
        // hash: null,
        length: 0,
      },
      _embed_input: '', // stored temporarily
    };
  }
  // SmartChunk: text, length, path
  update_data(data) {
    if (this.should_clear_embeddings(data)) this.data.embeddings = {};
    if (!this.vec) this._embed_input += data.text; // store text for embedding
    delete data.text; // clear data.text to prevent saving text
    super.update_data(data);
    return true;
  }
  should_clear_embeddings(data) {
    if(this.is_new) return true;
    if(this.smart_embed && this.vec?.length !== this.smart_embed.dims) return true;
    if(this.data.length !== data.length) return true;
    return false;
  }
  init() {
    if (!this.source) return console.log({ "no source for block": this.data });
    if(this.smart_embed && this.is_unembedded) this.smart_embed.embed_entity(this);
  }
  async get_content() {
    if (!this.note) return null;
    try {
      if (this.has_lines) { // prevents full parsing of note if not needed
        const all_lines = await this.note.get_content();
        const block_content = all_lines.split("\n").slice(this.line_start, this.line_end + 1).join("\n");
        return block_content;
      }
      const block_content = await this.env.smart_chunks.get_block_from_path(this.data.path, this.note);
      return block_content;
    } catch (e) {
      console.log("error getting block content for ", this.data.path, ": ", e);
      return "BLOCK NOT FOUND";
    }
  }
  async get_embed_input() {
    if (typeof this._embed_input === 'string' && this._embed_input.length) return this._embed_input; // return cached (temporary) input
    this._embed_input = this.breadcrumbs + "\n" + (await this.get_content());
    return this._embed_input;
  }
  async get_next_k_shot(i) {
    if (!this.next_block) return null;
    const current = await this.get_content();
    const next = await this.next_block.get_content();
    return `---BEGIN CURRENT ${i}---\n${current}\n---END CURRENT ${i}---\n---BEGIN NEXT ${i}---\n${next}\n---END NEXT ${i}---\n`;
  }
  get breadcrumbs() { return this.data.path.split("/").join(" > ").split("#").join(" > ").replace(".md", ""); }
  get embed_input() { return this._embed_input ? this._embed_input : this.get_embed_input(); }
  get lines() { return { start: this.data.lines[0], end: this.data.lines[1] }; };
  get has_lines() { return this.data.lines && this.data.lines.length === 2; }
  get folder() { return this.data.path.split("/").slice(0, -1).join("/"); }
  get is_block() { return this.data.path.includes("#"); }
  get is_gone() {
    if (!this.note?.t_file) return true; // gone if missing entity or file
    if (!this.note.last_history.blocks[this.key]) return true;
    return false;
  }
  // use text length to detect changes
  get name() { return (!this.env.main.settings.show_full_path ? this.data.path.split("/").pop() : this.data.path.split("/").join(" > ")).split("#").join(" > ").replace(".md", ""); }
  // uses data.lines to get next block
  get next_block() {
    if (!this.data.lines) return null;
    const next_line = this.data.lines[1] + 1;
    return this.note.blocks?.find(block => next_line === block.data?.lines?.[0]);
  }
  get line_start() { return this.data.lines[0]; }
  get line_end() { return this.data.lines[1]; }
  get source() { return this.env.smart_sources.get(this.source_key); }
  get source_key() { return this.data.path.split("#")[0]; }
  get size() { return this.data.length; }
  get is_unembedded() {
    if(this.excluded) return false;
    return super.is_unembedded;
  }
  get excluded() {
    const block_headings = this.path.split("#").slice(1); // remove first element (file path)
    return this.env.excluded_headings.some(heading => block_headings.includes(heading));
  }

  // CRUD
  async read() {
    return (await this.source.read())
      .split("\n")
      .slice(this.line_start, this.line_end + 1)
      .join("\n")
    ;
  }
  async append(append_content) {
    let all_lines = (await this.source.read()).split("\n");
    // use this.line_start and this.line_end to insert append_content at the correct position
    const content_before = all_lines.slice(0, this.line_end + 1);
    const content_after = all_lines.slice(this.line_end + 1);
    const new_content = [
      ...content_before,
      append_content,
      ...content_after,
    ].join("\n");
    await this.source.update(new_content);
  }
  async update(new_block_content) {
    const full_content = await this.source.read();
    const all_lines = full_content.split("\n");
    const new_content = [
      ...all_lines.slice(0, this.line_start),
      new_block_content,
      ...all_lines.slice(this.line_end + 1),
    ].join("\n");
    await this.source.update(new_content);
  }
  async remove() {
    await this.update("");
  }
  async move(to_key) {
    const key_type = to_key.includes("#") ? "block" : "source";
    if(key_type === "source"){
      const to_entity = this.env.smart_sources.get(to_key);
      if(to_entity?.has_source_file()){
        await to_entity.append(await this.read());
      }else{
        await this.env.smart_sources.create(to_key, await this.read());
      }
      await this.remove();
    }else{
      throw new Error("Cannot move to block"); // TODO: Implement moving to block
    }
  }

  // DEPRECATED since v2
  get note() { return this.source; }
  get note_key() { return this.data.path.split("#")[0]; }
  // backwards compatibility (DEPRECATED)
  get link() { return this.data.path; }
}
