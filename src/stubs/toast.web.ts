// @backpackapp-io/react-native-toast web stub. Used in 1 file.
export const toast = (message: string, _options?: any) => {
  console.log('[Toast]', message);
};
toast.success = (message: string, _options?: any) => console.log('[Toast:success]', message);
toast.error = (message: string, _options?: any) => console.error('[Toast:error]', message);
toast.loading = (message: string, _options?: any) => console.log('[Toast:loading]', message);
toast.dismiss = (_id?: string) => {};
toast.promise = (promise: Promise<any>, _opts: any) => promise;

export const Toasts = () => null;
export const ToastPosition = { TOP: 'top', BOTTOM: 'bottom' };

export default toast;
