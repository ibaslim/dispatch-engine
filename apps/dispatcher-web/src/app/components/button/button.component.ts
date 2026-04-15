import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'icon'
  | 'ghost'
  | 'ghost-danger'
  | 'ghost-outline'
  | 'ghost-success'
  | 'tab';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button.component.html'
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() label: string = '';
  @Input() icon: string = '';
  @Input() leadingIcon: string = '';
  @Input() leadingIconClass: string = 'w-4 h-4 text-gray-300';

  @Input() disabled: boolean = false;
  @Input() loading: boolean = false;
  @Input() extraClasses: string = '';
  @Input() ariaLabel: string = '';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Output() onClick = new EventEmitter<void>();

  onButtonClick(): void {
    if (!this.disabled && !this.loading) {
      this.onClick.emit();
    }
  }

  getButtonClasses(): string {
    const baseClasses = 'transition duration-200';
    const variantClasses = this.getVariantClasses();
    const stateClasses = this.disabled || this.loading ? 'opacity-60 cursor-not-allowed' : '';

    return `${baseClasses} ${variantClasses} ${stateClasses} ${this.extraClasses}`;
  }

  private getVariantClasses(): string {
    const variants = {
      primary: 'px-4 py-2 rounded-md bg-[#FFD150] text-black hover:bg-yellow-600',
      secondary: 'px-4 py-2 rounded-md bg-gray-600 text-white hover:bg-gray-700',
      danger: 'px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700',
      icon: 'w-10 h-10 p-0 rounded-full text-white',
      ghost: 'px-4 py-2 rounded-md bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-[#2a2d2a]',
      'ghost-danger': 'px-4 py-2 rounded-md bg-transparent text-red-600 hover:bg-gray-100',
      'ghost-outline':
        'border border-gray-300 dark:border-[#5a5d5a] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2a2d2a] px-3 py-2 rounded-md text-sm',
      'ghost-success':
        'border border-green-400 text-green-600 hover:bg-green-50 dark:hover:bg-[#143628] px-3 py-2 rounded-md text-sm',
      tab: 'pb-2 bg-transparent text-sm'
    };

    return variants[this.variant];
  }

  isIconButton(): boolean {
    return this.variant === 'icon';
  }

  isFilledIcon(): boolean {
    return this.icon.startsWith('M228') || this.icon.startsWith('M120');
  }
}