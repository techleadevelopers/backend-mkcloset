export const PIX_FEE_RATE = 0.0099;
export const CREDIT_CARD_FEE_RATE = 0.0399;

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

export const getPixFeeAmount = (shippingPrice: number) =>
  roundCurrency(shippingPrice * PIX_FEE_RATE);

export const getCreditCardFeeAmount = (orderBaseTotal: number) =>
  roundCurrency(orderBaseTotal * CREDIT_CARD_FEE_RATE);

export const getShippingPriceForPayment = (
  shippingPrice: number,
  paymentMethod: string,
) => {
  if (paymentMethod !== 'PIX') {
    return roundCurrency(shippingPrice);
  }

  return roundCurrency(shippingPrice + getPixFeeAmount(shippingPrice));
};
