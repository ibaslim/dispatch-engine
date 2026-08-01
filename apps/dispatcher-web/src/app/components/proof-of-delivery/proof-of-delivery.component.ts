import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ErrorMessageComponent } from '../error-message/error-message.component';

export interface ProofOfDeliveryValue {
    signature: boolean;
    picture: boolean;
}

@Component({
    selector: 'app-proof-of-delivery',
    templateUrl: './proof-of-delivery.component.html',
    standalone: true,
    imports: [
        CommonModule,
        ErrorMessageComponent
    ]
})
export class ProofOfDeliveryComponent {
    @Input() value: ProofOfDeliveryValue = { signature: false, picture: false };
    @Input() showSubmitValidation = false;

    @Output() valueChange = new EventEmitter<ProofOfDeliveryValue>();

    get showError(): boolean {
        return this.showSubmitValidation && !this.value.signature && !this.value.picture;
    }

    toggleSignature() {
        const newValue = {
            ...this.value,
            signature: !this.value.signature
        };
        this.value = newValue;
        this.valueChange.emit(newValue);
    }

    togglePicture() {
        const newValue = {
            ...this.value,
            picture: !this.value.picture
        };
        this.value = newValue;
        this.valueChange.emit(newValue);
    }
}
