import { TableComponent } from './table.component';

describe('TableComponent', () => {
  it('asks the parent to close an open menu without mutating its input', () => {
    const component = new TableComponent();
    const activeRow = { id: 'order-1' };
    const close = jest.fn();
    component.activeMenuRow = activeRow;
    component.menuClose.subscribe(close);

    component.onOutsideClick({ target: document.createElement('div') } as unknown as MouseEvent);

    expect(close).toHaveBeenCalledTimes(1);
    expect(component.activeMenuRow).toBe(activeRow);
  });

  it('does not close the menu when the action button is clicked', () => {
    const component = new TableComponent();
    const button = document.createElement('div');
    const icon = document.createElement('i');
    const close = jest.fn();
    button.classList.add('row-action-button');
    button.appendChild(icon);
    component.activeMenuRow = { id: 'order-1' };
    component.menuClose.subscribe(close);

    component.onOutsideClick({ target: icon } as unknown as MouseEvent);

    expect(close).not.toHaveBeenCalled();
  });

  it('tracks regenerated rows by their stable order id', () => {
    const component = new TableComponent();

    expect(component.trackByRowId(0, { id: 'order-1' })).toBe('order-1');
    expect(component.trackByRowId(3, {})).toBe(3);
  });
});
