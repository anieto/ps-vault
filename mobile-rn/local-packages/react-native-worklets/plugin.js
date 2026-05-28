// No-op babel plugin shim — required by react-native-css-interop@0.2.x
// for reanimated v4. We use reanimated v3, so this is a harmless empty plugin.
module.exports = function () {
  return { visitor: {} };
};
