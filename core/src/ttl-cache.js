
/**
 * Limit how many async tasks run at once; the rest wait their turn. Tasks
 * marked low priority (background refreshes) only get a slot when no
 * interactive task is waiting, so a backlog of refreshes never delays a
 * reader's request.
 */
export class Semaphore {
  #high = [];
  #low = [];
  #active = 0;

  constructor(limit) {
    this.limit = limit;
  }

  get active() {
    return this.#active;
  }

  get waiting() {
    return this.#high.length + this.#low.length;
  }

  get waitingLow() {
    return this.#low.length;
  }

  async run(task, { low = false } = {}) {
    // A finished task hands its slot straight to the next in line, so a new
    // caller can never slip in between and exceed the limit.
    if (this.#active >= this.limit) await new Promise((resolve) => (low ? this.#low : this.#high).push(resolve));
    else this.#active += 1;
    try {
      return await task();
    } finally {
      const next = this.#high.shift() ?? this.#low.shift();
      if (next) next();
      else this.#active -= 1;
    }
  }
}
