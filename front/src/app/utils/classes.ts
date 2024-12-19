export const getMessageClasses = (message: {username: string, value: string, sender: string}): { [key: string]: boolean } => {
    return {
      [message.sender]: !!message.sender,
    };
  }