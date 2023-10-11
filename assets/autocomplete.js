'use strict';

// Polyfill - scrollIntoViewIfNeeded
if (!Element.prototype.scrollIntoViewIfNeeded) {
  Element.prototype.scrollIntoViewIfNeeded = function (centerIfNeeded) {
    centerIfNeeded = arguments.length === 0 ? true : !!centerIfNeeded;
    let parent = this.parentNode,
        parentComputedStyle = window.getComputedStyle(parent, null),
        parentBorderTopWidth = parseInt(parentComputedStyle.getPropertyValue('border-top-width')),
        parentBorderLeftWidth = parseInt(parentComputedStyle.getPropertyValue('border-left-width')),
        overTop = this.offsetTop - parent.offsetTop < parent.scrollTop,
        overBottom = (this.offsetTop - parent.offsetTop + this.clientHeight - parentBorderTopWidth) > (parent.scrollTop + parent.clientHeight),
        overLeft = this.offsetLeft - parent.offsetLeft < parent.scrollLeft,
        overRight = (this.offsetLeft - parent.offsetLeft + this.clientWidth - parentBorderLeftWidth) > (parent.scrollLeft + parent.clientWidth),
        alignWithTop = overTop && !overBottom;
    if ((overTop || overBottom) && centerIfNeeded) {
      parent.scrollTop = this.offsetTop - parent.offsetTop - parent.clientHeight / 2 - parentBorderTopWidth + this.clientHeight / 2;
    }
    if ((overLeft || overRight) && centerIfNeeded) {
      parent.scrollLeft = this.offsetLeft - parent.offsetLeft - parent.clientWidth / 2 - parentBorderLeftWidth + this.clientWidth / 2;
    }
    if ((overTop || overBottom || overLeft || overRight) && !centerIfNeeded) {
      this.scrollIntoView(alignWithTop);
    }
  };
}
// END: Polyfill - scrollIntoViewIfNeeded

const clickOutside = (elements, callback) => {
  const fn = (event) => {
    let target = event.target;

    do {
      for (const element of elements) {
        if (target === element) return;
      }

      target = target.parentNode;
    } while (target);

    callback();
  };

  document.addEventListener('click', fn);

  return () => {
    document.removeEventListener('click', fn);
  };
};

const deepMerge = (...objects) => {
  const isObject = (obj) => (obj && (typeof obj === 'object'));

  return objects.reduce((prev, obj) => {
    Object.keys(obj).forEach((key) => {
      const pVal = prev[key];
      const oVal = obj[key];

      if (Array.isArray(pVal) && Array.isArray(oVal)) {
        prev[key] = pVal.concat(...oVal);
      } else if (isObject(pVal) && isObject(oVal)) {
        prev[key] = deepMerge(pVal, oVal);
      } else {
        prev[key] = oVal;
      }
    });

    return prev;
  }, {});
};

const DEFAULT_OPTIONS = {
  valueMatchItem: false, // Value must match one of the listed items
  items: [],
  onInit: null,
  onDestroy: null,
};

const DEFAULT_CLASS_NAMES = {
  init: 'is-init-autocomplete',
  input: 'autocomplete-input',
  wrapper: 'autocomplete-wrapper',
  itemsWrapper: 'autocomplete-items-wrapper',
  itemsWrapperVisible: 'is-visible',
  item: 'autocomplete-item',
  itemVisible: 'is-visible',
  itemActive: 'is-active',
};

class Autocomplete {
  constructor(inputElement, options = {}, classNames = {}) {
    this.elements = {
      input: inputElement,
      wrapper: null,
      itemsWrapper: null,
      items: null,
      activeItem: null,
    };

    this.options = deepMerge(DEFAULT_OPTIONS, options);
    this.classNames = deepMerge(DEFAULT_CLASS_NAMES, classNames);

    this.temp = {
      hasItemsVisible: false,
    };

    this.cleanup = {
      clickOutside: null,
    };

    this.showItems = this.showItems.bind(this);
    this.hideItems = this.hideItems.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleItemClick = this.handleItemClick.bind(this);

    this.init();
  }

  isInit() {
    return this.elements.input.classList.contains(this.classNames.init);
  }

  init() {
    if (this.isInit()) {
      console.error(`Autocomplete is already initialized (id): ${this.elements.input.id}`);
      return;
    }

    this.generateHTML();
    this.addEvents();

    if (this.elements.input.value !== '') this.handleInput();

    this.elements.input.classList.add(this.classNames.init);

    if (this.options.onInit) this.options.onInit();
  }

  generateHTML() {
    const wrapperElement = `<div class="${this.classNames.wrapper}"></div>`;
    this.elements.input.insertAdjacentHTML('beforebegin', wrapperElement);
    this.elements.wrapper = this.elements.input.previousElementSibling;
    this.elements.wrapper.appendChild(this.elements.input);

    this.elements.input.classList.add(this.classNames.input);

    this.generateItems(this.options.items);
  }

  destroyHTML() {
    this.elements.wrapper.replaceWith(this.elements.input);
    this.elements.input.classList.remove(this.classNames.input);
  }

  generateItems(items) {
    const itemsWrapperElement = `<div class="${this.classNames.itemsWrapper}"></div>`;
    this.elements.wrapper.insertAdjacentHTML('beforeend', itemsWrapperElement);
    this.elements.itemsWrapper = this.elements.wrapper.querySelector(`.${this.classNames.itemsWrapper}`);

    for (const item of items) {
      const itemElement = `<div class="${this.classNames.item} ${this.classNames.itemVisible}">${item}</div>`;
      this.elements.itemsWrapper.insertAdjacentHTML('beforeend', itemElement);
    }
    this.elements.items = [...this.elements.itemsWrapper.querySelectorAll(`.${this.classNames.item}`)];
    for (const item of this.elements.items) {
      item.addEventListener('click', this.handleItemClick);
    }
  }

  setInput(value) {
    this.elements.input.value = value;
    this.handleInput();

    this.hideItems();
  }

  setItems(items) {
    this.options.items = items;

    if (this.elements.itemsWrapper) {
      this.elements.itemsWrapper.remove();
      this.elements.itemsWrapper = null;
    }

    this.generateItems(this.options.items);
  }

  isShownWithItems() {
    return (this.elements.itemsWrapper.classList.contains(this.classNames.itemsWrapperVisible) && this.temp.hasItemsVisible);
  }

  showItems() {
    this.elements.itemsWrapper.classList.add(this.classNames.itemsWrapperVisible);
  }

  hideItems() {
    this.elements.itemsWrapper.classList.remove(this.classNames.itemsWrapperVisible);

    this.clearActiveItemStyles();
    this.elements.activeItem = null;

    if (this.options.valueMatchItem) {
      const inputValueLowerCase = this.elements.input.value.toLowerCase();
      const hasMatching = this.elements.items.some((item) => (item.innerText.toLowerCase() === inputValueLowerCase));
      if (!hasMatching) this.elements.input.value = '';
    }
  }

  clearActiveItemStyles() {
    for (const item of this.elements.items) {
      item.classList.remove(this.classNames.itemActive);
    }
  }

  handleArrowKey(direction) {
    if (!direction) return;

    this.clearActiveItemStyles();

    const items = [...this.elements.itemsWrapper.querySelectorAll(`.${this.classNames.itemVisible}`)];
    const firstItem = items[0];
    const lastItem = items[items.length - 1];

    switch (direction) {
      case 'ArrowUp': {
        if (this.elements.activeItem && this.elements.activeItem !== firstItem) {
          const currentItemIndex = items.findIndex((item) => (item === this.elements.activeItem));
          this.elements.activeItem = items[currentItemIndex - 1];
        } else {
          this.elements.activeItem = lastItem;
        }
        break;
      }
      case 'ArrowDown': {
        if (this.elements.activeItem && this.elements.activeItem !== lastItem) {
          const currentItemIndex = items.findIndex((item) => (item === this.elements.activeItem));
          this.elements.activeItem = items[currentItemIndex + 1];
        } else {
          this.elements.activeItem = firstItem;
        }
        break;
      }
    }

    this.elements.activeItem.classList.add(this.classNames.itemActive);
    this.elements.activeItem.scrollIntoViewIfNeeded();
  }

  handleKeydown(event) {
    if (!this.isShownWithItems()) return;

    switch (event.key) {
      case 'ArrowUp': {
        event.preventDefault();

        this.handleArrowKey('ArrowUp');

        break;
      }
      case 'ArrowDown': {
        event.preventDefault();

        this.handleArrowKey('ArrowDown');

        break;
      }
      case 'Enter': {
        event.preventDefault();

        if (this.elements.activeItem) {
          this.setInput(this.elements.activeItem.innerText);
        }

        break;
      }
    }
  }

  handleInput() {
    const inputValueLowerCase = this.elements.input.value.toLowerCase();

    if (inputValueLowerCase === '') {
      this.hideItems();
    } else {
      this.showItems();
    }

    this.temp.hasItemsVisible = false;
    for (const item of this.elements.items) {
      if (item.innerText.toLowerCase().indexOf(inputValueLowerCase) > -1) {
        item.classList.add(this.classNames.itemVisible);
        this.temp.hasItemsVisible = true;
      } else {
        item.classList.remove(this.classNames.itemVisible);
      }
    }
  }

  handleItemClick(event) {
    this.setInput(event.currentTarget.innerText);
  }

  addEvents() {
    this.elements.input.addEventListener('keydown', this.handleKeydown);
    this.elements.input.addEventListener('input', this.handleInput);

    this.cleanup.clickOutside = clickOutside([this.elements.input, this.elements.itemsWrapper], this.hideItems);
  }

  removeEvents() {
    this.elements.input.removeEventListener('keydown', this.handleKeydown);
    this.elements.input.removeEventListener('input', this.handleInput);

    this.cleanup.clickOutside();
  }

  destroy() {
    if (!this.isInit()) {
      console.error(`Autocomplete is not initialized (id): ${this.elements.input.id}`);
      return;
    }

    this.destroyHTML();
    this.removeEvents();

    this.elements.input.classList.remove(this.classNames.init);

    if (this.options.onDestroy) this.options.onDestroy();
  }
}
