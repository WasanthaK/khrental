const isSafeInternalPath = (value) => (
  typeof value === 'string'
  && value.startsWith('/')
  && !value.startsWith('//')
);

export const buildReturnPath = (location = null) => {
  const pathname = location?.pathname;

  if (!isSafeInternalPath(pathname)) {
    return null;
  }

  const search = typeof location?.search === 'string' && location.search.startsWith('?')
    ? location.search
    : '';
  const hash = typeof location?.hash === 'string' && location.hash.startsWith('#')
    ? location.hash
    : '';

  return `${pathname}${search}${hash}`;
};

export const getPostLoginPath = (state = null, fallbackPath = '/') => (
  buildReturnPath(state?.from) || fallbackPath
);
