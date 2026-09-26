"""Domain errors that the API layer maps onto HTTP status codes."""


class F1DataError(Exception):
    status_code = 500


class InvalidRequestError(F1DataError):
    status_code = 400


class NotFoundError(F1DataError):
    status_code = 404


class DataUnavailableError(F1DataError):
    status_code = 503
