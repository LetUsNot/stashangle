import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  commitDelegatedMarkerSubmit,
  ensureMarkerSubmitGuard,
  setMarkerSubmitInterceptor,
  teardownMarkerSubmitGuard
} from "../markerFormSubmitGuard";

describe("markerFormSubmitGuard", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form>
        <div class="form-container">
          <label>Title</label>
          <input type="text" />
          <label>Time</label>
          <input placeholder="mm:ss" value="0:15" />
          <div class="buttons-container">
            <button type="button" class="btn btn-primary">Save</button>
          </div>
        </div>
      </form>
    `;
  });

  afterEach(() => {
    teardownMarkerSubmitGuard();
    document.body.innerHTML = "";
  });

  it("invokes the interceptor once for duplicate submits in the same turn", () => {
    const interceptor = vi.fn();
    setMarkerSubmitInterceptor(interceptor);

    const form = document.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    expect(interceptor).toHaveBeenCalledTimes(1);
  });

  it("allows a delegated submit through without re-entering the interceptor", () => {
    const interceptor = vi.fn();
    const submitSpy = vi.fn((event: Event) => {
      event.preventDefault();
    });

    setMarkerSubmitInterceptor(interceptor);
    ensureMarkerSubmitGuard();

    const form = document.querySelector("form") as HTMLFormElement;
    form.addEventListener("submit", submitSpy);

    commitDelegatedMarkerSubmit(form);

    expect(interceptor).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
