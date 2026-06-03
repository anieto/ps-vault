import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async ({ locale }) => {
  return {
    locale: locale ?? "en",
    messages: (await import(`../../locales/${locale ?? "en"}.json`)).default,
  };
});
