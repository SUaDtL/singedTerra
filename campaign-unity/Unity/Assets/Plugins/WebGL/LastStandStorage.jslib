mergeInto(LibraryManager.library, {
  LastStandStorage_Get: function (keyPointer) {
    var reply;
    try {
      var value = window.localStorage.getItem(UTF8ToString(keyPointer));
      reply = value === null ? "0" : "1" + value;
    } catch (error) {
      reply = "2";
    }
    var size = lengthBytesUTF8(reply) + 1;
    var pointer = _malloc(size);
    if (!pointer) return 0;
    stringToUTF8(reply, pointer, size);
    return pointer;
  },

  LastStandStorage_Set: function (keyPointer, valuePointer) {
    try {
      window.localStorage.setItem(UTF8ToString(keyPointer), UTF8ToString(valuePointer));
      return 1;
    } catch (error) {
      return 0;
    }
  }
});
