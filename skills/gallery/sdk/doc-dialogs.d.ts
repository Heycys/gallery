export interface DocDialogsApi {
  open(target: string | HTMLDialogElement, opener?: HTMLElement | null): HTMLDialogElement;
  close(target: string | HTMLDialogElement, returnValue?: string): HTMLDialogElement;
}
