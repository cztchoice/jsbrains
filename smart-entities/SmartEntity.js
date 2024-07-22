import { CollectionItem } from "smart-collections/CollectionItem.js";

export class SmartEntity extends CollectionItem {
  static get defaults() {
    return {
      data: {
        path: null,
        embeddings: {}, // contains keys per model
        embedding: {}, // DEPRECATED
      },
    };
  }
  get_key() { return this.data.path; }
  // DO: clarified/improved logic
  save() {
    this.collection.set(this);
    this.env.save();
  }
  get_nearest(filter = {}) { }
  async get_as_context(params = {}) {
    return `---BEGIN NOTE${params.i ? " " + params.i : ""} [[${this.path}]]---\n${await this.get_content()}\n---END NOTE${params.i ? " " + params.i : ""}---`;
  }
  async get_content() { } // override in child class
  async get_embed_input() { } // override in child class

  // getters
  get embed_link() { return `![[${this.data.path}]]`; }
  get multi_ajson_file_name() { return (this.path.split("#").shift()).replace(/[\s\/\.]/g, '_').replace(".md", ""); }
  get name() { return (!this.env.main.settings.show_full_path ? this.path.split("/").pop() : this.path.split("/").join(" > ")).split("#").join(" > ").replace(".md", ""); }
  get path() { return this.data.path; }
  get tokens() { return this.data.embeddings[this.embed_model]?.tokens; }
  get embed_model() { return this.collection.smart_embed_model; }
  get vec() { return this.data?.embeddings?.[this.embed_model]?.vec; }
  get embedding() { return this.data.embeddings?.[this.embed_model]; }
  // setters
  set embedding(embedding) {
    if (!this.data.embeddings) this.data.embeddings = {};
    this.data.embeddings[this.embed_model] = embedding;
  }
  set error(error) { this.data.embeddings[this.embed_model].error = error; }
  set tokens(tokens) {
    if (!this.embedding) this.embedding = {};
    this.embedding.tokens = tokens;
  }
  set vec(vec) {
    if (!this.embedding) this.embedding = {};
    this.data.embeddings[this.embed_model].vec = vec;
  }
}
